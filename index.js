var http = require('http');
var _ = require('underscore');
var pcm = require('pcm-boilerplate');
var qmean = require('compute-qmean');
var mean = require('compute-incrmmean');

function multiplBufJoin(bufs) {
    let buff = undefined;
    for (let i = 0; i < bufs.length; i++) {
        if (buff == undefined) {
            buff = bufs[i];
        } else {
            buff = bufjoin([buff, bufs[i]]);
        }
    }
    return buff;
}

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
    var save10Lastblocks = [];

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

            if (save10Lastblocks == undefined) {
                save10Lastblocks = [block[0]];
            } else {
                if (save10Lastblocks.length > 40) {
                    save10Lastblocks = save10Lastblocks.slice(1);
                }
                save10Lastblocks.push(block[0]);
            }

            const pieceSoundAverage = toDecibel(rmsAvg());
            if (dB > pieceSoundAverage + options.triggerLevel) {
                if (record == undefined) {
                    record = {
                        startAvg: rmsAvg(rms) * 1.10,
                        currentAvg: mean(100)(rms),
                        avg: mean(100),
                        start: true,
                        end: false,
                        blocks: multiplBufJoin(save10Lastblocks)//block[0]
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
