#! /usr/bin/env node

var VERSION = '0.0.4';
var program = require('commander');
var Promise = require('bluebird');
var ProgressBar = require('progress');
var inquirer = require('inquirer');
var https = require('https');
var path = require('path');
var fs = require('fs');
var chalk = require('chalk');
var concat = require('concat-files');
var video_resolutions = {};
var temp_files = [];
var TEMP_DIR = path.resolve('temp'+(new Date).getTime());
var output_dir;

function grab(url, message) {
  return new Promise(function(resolve, reject) {
    var req = https.request(url);
    var result = '';
    req.on('response', function(res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error("Cannot grab content from statusCode " + res.statusCode));
      }
      if (message) {
        var len = parseInt(res.headers['content-length'], 10);
        var bar = new ProgressBar(message, {
          complete: chalk.green('.'),
          incomplete: ' ',
          width: 3,
          total: len
        });
      }
      res.on('data', function(chunk) {
        if (message) {
          bar.tick(chunk.length);
        }
        result += chunk;
      });
      res.on('end', function() {
        resolve(result);
      });
    });
    req.end();
  });
}

function download(url, file_stream, message) {
  return new Promise(function(resolve, reject) {
    var req = https.request(url);
    req.on('response', function(res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error("Cannot download file, statusCode = " + res.statusCode));
      }
      var len = parseInt(res.headers['content-length'], 10);
      var bar = new ProgressBar(message, {
        complete: chalk.green('='),
        incomplete: ' ',
        width: 20,
        total: len
      });
      res.on('data', function(chunk) {
        bar.tick(chunk.length);
      });
      res.on('end', function() {
        resolve(file_stream);
      });
      res.pipe(file_stream);
    });
    req.end();
  });
}

function removeTempFiles() {
  if (temp_files.length) {
    for (i in temp_files) {
      var tmp_file = temp_files[i];
      if (fs.existsSync(tmp_file)) {
        fs.unlinkSync(tmp_file);
      }
    }

    fs.rmdirSync(TEMP_DIR);
  }
}

function get_title(content) {
  var regex = /og:title\" content=\"([^\"]+)\"/;
  var title = content.match(regex);

  if (title.length >= 2) {
    return title[1];
  } else {
    return null;
  }
}

function get_url_title(url) {
  var resolved_url = url.split('?')[0];
  var paths = resolved_url.split('/');
  return paths.pop();
}

function is_directory(filepath) {
  return fs.existsSync(filepath) && fs.lstatSync(filepath).isDirectory();
}

function has_extension(filename) {
  return (filename.split('.').length > 1 && filename.split('.').pop().length < 5);
}

function guess_extension(filename) {
  var guessers = {
    'mp4': /\.mp4/,
    'mkv': /\.mkv/,
  } 

  for (ext in guessers) {
    if (filename.match(guessers[ext])) return ext;
  }

  return 'mp4'; // default extension
}

function error(message) {
  console.error("\n"+chalk.red('UPSS!! ')+message+"\n");
}

// remove temp files jika terjadi interupsi (misal: ctrl+C)
process.on('SIGINT', function() {
  removeTempFiles();
  console.log("\nCaught interrupt signal.");
});

program.version(VERSION)
.arguments('<url> [output]')
.action(function(url, output) {
  // pastikan url adalah url vidio.com
  if (!url.match(/^https?\:\/\/www\.vidio\.com\/watch\//)) {
    return error("Url harus berupa url video dari vidio.com");
  }  

  // jika terdapat argumen output
  if (output) {
    if (is_directory(output)) {
      // jika output adalah sebuah directory, set output_dir
      output_dir = output;
      output = null; // biarkan nama file output nanti terisi otomatis by title/slug
    } else {
      // pastikan directory output ada sebelum proses memakan quota dilanjutkan :p
      if (!fs.existsSync(path.dirname(output))) {
        return error("Output direktori '"+path.dirname(output)+"' tidak ada");
      }
    }
  }

  // grab url
  grab(url, chalk.cyan(">") + " Mengambil informasi halaman :bar")
  // scrap url playlist
  .then(function(content) {
    if (!output) {
      output = get_title(content) || get_url_title(url);
    }

    return new Promise(function(resolve, reject) {
      var url_data_clip = content.match(/https:\/\/www\.vidio\.com\/videos\/\d+\/playlist\.m3u8/);
      if (!url_data_clip.length) {
        reject(new Error("Cannot find data clip url at that page"));
      } else {
        resolve(url_data_clip[0]);
      }
    })
  })
  // grab url playlist dan scrap metadata (resolusi video)
  .then(function(url_data_clip) {
    return new Promise(function(resolve, reject) {
      grab(url_data_clip).then(function(content) {
        var list_metadata = content.match(/(\#[^\n]+[\n\r\t]*)(https[^\n]+)/g).map(function(match) {
          var split = match.split("\n");
          var data = {
            url: split[1]
          };
          split[0].replace(/^\#/, '').split(',').map(function(metadata) {
            var s = metadata.split('=');
            data[s[0].toLowerCase()] = (s[1] || '').trim().replace(/(^\"|\"$)/g, '');
          });
          return data;
        });
        var resolutions = {};
        list_metadata.forEach(function(metadata) {
          resolutions[metadata.name + " (" + metadata.resolution + ")"] = metadata.url;
        });
        resolve(resolutions);
      })
    });
  })
  // Propmpt/tanya mau resolusi yang mana?
  .then(function(resolutions) {
    return inquirer.prompt({
      type: 'list',
      name: 'resolution',
      message: 'Pilih resolusi video',
      choices: Object.keys(resolutions)
    }).then(function(answer) {
      return Promise.resolve(resolutions[answer.resolution]);
    });
  })
  // grab dan scrap list url transport stream (.ts)
  .then(function(url_video_resolution) {
    return new Promise(function(resolve, reject) {
      grab(url_video_resolution, chalk.cyan(">") + " Mengambil daftar url stream").then(function(result) {
        var urls = result.match(/https:[^\n]+/g);
        // jika urls yang match dengan https tidak ada, mungkin hanya berisi url videonya saja
        if (!urls) {
          var split = url_video_resolution.split('/');
          var file_pattern = new RegExp(split.pop().substr(0, 10) + '[^\n]+', 'g');
          var url_video_directory = split.join('/');
          urls = (result.match(file_pattern) || []).map(function(url) {
            return url_video_directory + '/' + url;
          });
        }
        resolve(urls);
      });
    });
  })
  // Download semua file .ts ke folder ./temp
  .then(function(stream_urls) {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR);
    }

    var count = stream_urls.length;
    var x = 0;
    output_path = stream_urls[0].split('/').pop().replace(/-\d+\.ts$/, '');
    return Promise.each(stream_urls, function(stream_url) {
      var flags = !fs.existsSync(dest) ? 'w' : 'r+';
      var chunk_filename = stream_url.split('/').pop();
      var message = chalk.cyan("[") + (++x) + chalk.cyan("/") + count + chalk.cyan("] ") + chunk_filename + " [:bar] :percent";
      var sort = '0'.repeat(5 - ('' + x).length) + x;
      var dest = TEMP_DIR + '/' + sort + '_' + chunk_filename;
      var file_stream = fs.createWriteStream(dest);
      temp_files.push(dest);
      return download(stream_url, file_stream, message);
    });
  })
  // concat semua file .ts jadi 1 file 
  .then(function(videos) {
    if(!has_extension(output)) {
      output = output+'.'+guess_extension(temp_files[0]);
    }

    if (output_dir) {
      output = output_dir + '/' + output;
    }

    console.log(chalk.cyan(">") + " Menyatukan potongan-potongan video ...");
    concat(temp_files, output, function() {
      console.log(chalk.green("SELESAI!") + " " + output);
      removeTempFiles(); // kalo udah remove temp files
    });
  })
  .catch(function(err) {
    return error(err.message);
  });

})
.parse(process.argv);

if (program.args.length < 1) {
  program.outputHelp();
}
