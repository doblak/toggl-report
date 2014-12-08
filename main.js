var async = require('async');

var toggl = require('./toggl');
var report = require('./report');
var timetracker = require('./timetracker');

var args = process.argv.slice(2);

if (args[0] === 'export') {
    async.waterfall([
            toggl.getData,
            report.exportXlsx
        ],
        function(error, results) {
            if (results) {
                console.log(results);
            }
            if (error) {
                console.log(error);
            }
        });
}

if (args[0] === 'sync') {
    async.waterfall([
        toggl.getData,
        timetracker.syncTimeTracker
    ],
    function(error, results) {
        if (results) {
            console.log(results);
        }
        if (error) {
            console.log(error);
        }
    });
}