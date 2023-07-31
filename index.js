var http = require('http');
var _ = require('underscore');
var pcm = require('pcm-boilerplate');
var qmean = require('compute-qmean');
var mean = require('compute-incrmmean');

function bufjoin(bufs){
    let aout = new Float32Array(bufs[0].length + bufs[1].length);
    aout.set(bufs[0], 0);
    aout.set(bufs[1], bufs[0].length);
    return aout;
}

function NoiseDetection(options, callback) {
    var streamDecoder = new pcm.StreamDecoder(options.format);
    var rmsAvg = mean(2000);
    var record = undefined;

    function toDecibel(rms) {
        return rms*1000;
    }

    function processBlock() {
        var block = streamDecoder.read();
        var samples = [];
        var rms;
        var db;
        if (block) {
            _.forEach(block[0], function (sample) {
                samples.push(sample);
            });
            rms = qmean(samples);
            rmsAvg(rms);
            dB = toDecibel(rms);
            const pieceSoundAverage = toDecibel(rmsAvg());
            if (dB > pieceSoundAverage + options.triggerLevel) {
                if (record == undefined) {
                    record = {
                        startAvg: rmsAvg(rms) * 1.10,
                        currentAvg: mean(100)(rms),
                        avg: mean(100),
                        start: true,
                        end: false,
                        blocks: block[0]
                    };
                } else {
                    record.avg(rms);
                    record.currentAvg = record.avg(rms);
                    record.blocks = bufjoin([record.blocks, block[0]]);
                }
                callback(dB, record);
            } else {
                if (record != undefined) {
                    record.avg(rms);
                    record.currentAvg = record.avg(rms);
                    record.blocks = bufjoin([record.blocks, block[0]]);
                    if (record.avg() < record.startAvg) {
                        record.end = true;
                        callback(dB, { ... record });
                        record = undefined;
                    } else {
                        callback(dB, record);
                    }
                }
            }
        }
    }

    this.start = function() {
        http.get(options.url, function (source) {
            source.pipe(streamDecoder);
            streamDecoder.on('readable', processBlock);
        });
    }
}

module.exports = NoiseDetection;
