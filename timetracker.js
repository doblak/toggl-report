var config = require('./config')
    //https://github.com/request/request
var request = require('request');
//web scraping lib:
//https://github.com/cheeriojs/cheerio
var cheerio = require('cheerio');
//https://github.com/caolan/async
var async = require('async');
var _ = require('underscore');
_.str = require('underscore.string');
var moment = require('moment-range');

//setup cookie handling
request = request.defaults({
    jar: true
});

var togglData = null;
var idMap = null;
var ttProjectNames = null;
var ttTaskNames = null;

function syncTimeTracker(data, callback) {
    togglData = data;
    async.series([
            ttLoginGet,
            ttLoginPost,
            ttTimeEntryPageGet,
            ttGetIdMap,
            ttPostEntries
        ],
        // optional callback
        function(error, results) {
            if (results) {
                console.log(results);
                console.log(require('./report'));
            }
            if (error) {
                //enable the line below for full logging
                //console.log(error);
                console.log({
                    error: error.error,
                    statusCode: error.response.statusCode
                });
            }
        });
}

function ttLoginGet(callback) {
    request(config.timeTrackerBaseUrl + 'login.php', function(error, response, body) {
        //console.log(body);
        //printSeparator();
        if (!error && response.statusCode == 200) {
            callback(null, 'GET login.php successful');
            return;
        }
        callback({
            error: error,
            response: response,
            body: body
        }, 'GET login.php failed');
    });
}

function ttLoginPost(callback) {
    request.post({
        url: config.timeTrackerBaseUrl + 'login.php',
        form: {
            login: config.timeTrackerUsername,
            password: config.timeTrackerPassword,
            btn_login: 'prijava',
            browser_today: moment().format('YYYY-MM-DD')
        }
    }, function(error, response, body) {
        //console.log(body);
        //printSeparator();
        if (!error && response.statusCode == 302) {
            callback(null, 'POST login.php successful');
            return;
        }
        callback({
            error: error,
            response: response,
            body: body
        }, 'POST login.php failed');
    });
}

function ttTimeEntryPageGet(callback) {
    request(config.timeTrackerBaseUrl + 'time.php', function(error, response, body) {
        //console.log(body);
        //printSeparator();

        if (!error && response.statusCode == 200) {

            var $ = cheerio.load(body);

            _.each($('script'), function(scriptElement) {
                var scriptText = $(scriptElement).text();
                //console.log(scriptText);
                if (!_.str.include(scriptText, 'project_names = new Array();') || !_.str.include(scriptText, 'task_ids = new Array();')) {
                    return;
                }

                var projectNamesScript = _.str.strRightBack(scriptText, '// Prepare an array of project names.');
                projectNamesScript = _.str.strLeftBack(projectNamesScript, "// We'll use this array to populate project dropdown when client is not selected.");
                console.log('eval PROJECT NAMES script:\n %s', projectNamesScript);
                //
                eval(projectNamesScript);

                var taskNamesScript = _.str.strRightBack(scriptText, '// Prepare an array of task names.');
                taskNamesScript = _.str.strLeftBack(taskNamesScript, "// Mandatory top options for project and task dropdowns.");
                console.log('eval TASK: NAMES script:\n %s', taskNamesScript);
                eval(taskNamesScript);

                ttProjectNames = project_names;
                ttTaskNames = task_names;

                console.log(ttProjectNames);
                console.log(ttTaskNames);
            });
        }

        if (ttProjectNames !== null && ttTaskNames !== null) {
            callback(null, 'GET time.php successful');
            return;
        }
        callback({
            error: error,
            response: response,
            body: body
        }, 'GET time.php failed');
    });
}

function ttGetIdMap(callback) {
    var start = moment(config.from);
    var map = {};
    var requestsByDate = [];

    moment().range(moment(config.from), moment(config.to)).by('days', function(moment) {
        var dateParamValue = moment.format('YYYY-MM-DD');
        var r = function(callback) {
            request(config.timeTrackerBaseUrl + 'time.php?date=' + dateParamValue, function(error, response, body) {
                //console.log(body);
                //printSeparator();
                if (!error && response.statusCode == 200) {
                    var $ = cheerio.load(body);
                    //console.log($("a[href^='time_edit.php']"));
                    //console.log($("a[href^='time_edit.php']").get(0));
                    _.each($("a[href^='time_edit.php']"), function(item) {
                        var entryNote = _.str.trim($(item).parent().prev().text());
                        var togglId = _.str.include(entryNote, '[[') && _.str.include(entryNote, ']]') ? _.str.strLeftBack(_.str.strRightBack(entryNote, '[['), ']]') : '';
                        var ttId = _.str.strRightBack($(item).attr('href'), '=');
                        map[ttId] = togglId;
                    });
                    callback(null, 'GET time.php for ' + dateParamValue + ' successful');
                    return;
                }
                callback({
                    error: error,
                    response: response,
                    body: body
                }, 'GET time.php for ' + dateParamValue + ' failed');
            });
        };
        requestsByDate.push(r);
    });

    async.series(requestsByDate,
        function(error, results) {
            if (results) {
                console.log(results);
            }
            if (error) {
                //enable the line below for full logging
                //console.log(error);
                console.log({
                    error: error.error,
                    statusCode: error.response.statusCode
                });
            }
            idMap = map;
            callback(error, map);
        });
}

function ttPostEntries(callback) {
    var postRequests = [];

    _.each(togglData, function(entry) {
        var entryDateFormatted = moment(entry.start).format('YYYY-MM-DD');
        var todayFormatted = moment().format('YYYY-MM-DD');
        var projectId = null;
        var taskId = null;
        console.log("lookup: " + entry.project);
        var togglProjectString = _.str.words(entry.project, "/")[0];
        console.log("togglProjectString: " + togglProjectString);
        var togglTagString = _.str.include(entry.project, '/') ? _.str.words(entry.project, "/")[1] : 'swdev';
        console.log("togglTagString: " + togglTagString);
        if(config.projectTagToProjectNameAndIdLookup[togglProjectString]){
            var configProjectId = parseInt(config.projectTagToProjectNameAndIdLookup[togglProjectString][1]);
            console.log("configProjectId: " + configProjectId);
            var configProjectName = config.projectTagToProjectNameAndIdLookup[togglProjectString][1] + ' - ' + config.projectTagToProjectNameAndIdLookup[togglProjectString][0];
            console.log("configProjectName: " + configProjectName);

            var ttProjectIndex = _.indexOf(ttProjectNames, configProjectName);
            
            if(ttProjectIndex >= 0) {
                console.log("project match: " + configProjectId);
                projectId = ttProjectIndex;
            }
        }
        if(config.taskTagToTaskNameAndIdLookup[togglTagString]){
            var configTaskId = parseInt(config.taskTagToTaskNameAndIdLookup[togglTagString][1]);
            console.log("configTaskId: " + configTaskId);
            var configTaskName = config.taskTagToTaskNameAndIdLookup[togglTagString][1] + ' - ' + config.taskTagToTaskNameAndIdLookup[togglTagString][0];
            console.log("configTaskName: " + configTaskName);
            
            var ttTaskIndex = _.indexOf(ttTaskNames, configTaskName);
            
            if(ttTaskIndex >= 0) {
                console.log("task match: " + configTaskId);
                taskId = ttTaskIndex;
            }
        }

        if(projectId === null || taskId === null){
            callback({
                    error: null,
                    response: {},
                    body: null
                }, 'Could not map project/task: ' + entry.project);
            return;
        }

        //if entry already exists, skip adding it
        if (_.contains(_.values(idMap), entry.id.toString())) {
            console.log('Entry ' + entry.id + ' already exists in timetracker, skipping.');
            return;
        }

        var r = function(callback) {
            request({
                url: config.timeTrackerBaseUrl + 'time.php?date=' + entryDateFormatted,
                method: 'POST',
                form: {
                    project: JSON.stringify(projectId),
                    task: JSON.stringify(taskId),
                    duration: moment(entry.end).diff(moment(entry.start), 'hours', true),
                    date: entryDateFormatted,
                    note: entry.description + ' [[' + entry.id + ']]',
                    btn_submit: 'Submit',
                    browser_today: todayFormatted
                }
            }, function(error, response, body) {
                //console.log(body);
                //printSeparator();
                if (!error && response.statusCode == 302) {
                    callback(null, 'POST time.php for ' + entryDateFormatted + ' (' + entry.description + ') successful');
                    return;
                }
                callback({
                    error: error,
                    response: response,
                    body: body
                }, 'POST time.php for ' + entryDateFormatted + ' (' + entry.description + ') failed');
            });
        };
        postRequests.push(r);
    });

    async.series(postRequests,
        function(error, results) {
            if (results) {
                console.log(results);
            }
            if (error) {
                //enable the line below for full logging
                //console.log(error);
                console.log({
                    error: error.error,
                    statusCode: error.response.statusCode
                });
            }
            callback(error, "Successfully synced entries");
        });
}

// function enterTestRecord() {
//     request.post({
//         url: config.timeTrackerBaseUrl + 'time.php?date=2014-11-27',
//         form: {
//             project: '1',
//             task: '6',
//             duration: '7',
//             date: '2014-11-27',
//             note: 'sickness leave [33643908]',
//             btn_submit: 'Submit',
//             browser_today: '2014-12-02'
//         }
//     }, function(error, response, body) {
//         //console.log(body);
//         //printSeparator();
//         if (!error && response.statusCode == 302) {
//             //timeGet();
//             prepareReport();
//         }
//     });
// }

function prepareReport() {
    request.post({
        url: config.timeTrackerBaseUrl + 'reports.php',
        form: {
            favorite_report: '-1',
            project: '',
            task: '',
            period: '',
            start_date: '2014-11-01',
            end_date: '2014-11-30',
            chproject: '1',
            chstart: '1',
            chduration: '1',
            chtask: '1',
            chfinish: '1',
            chnote: '1',
            group_by: 'no_grouping',
            new_fav_report: '',
            btn_generate: 'Generate',
            fav_report_changed: ''
        }
    }, function(error, response, body) {
        //console.log(body);
        //printSeparator();
        if (!error && response.statusCode == 302) {
            getReport();
        }
    });
}

function getReport() {
    request(config.timeTrackerBaseUrl + 'tofile.php?type=csv', function(error, response, body) {
        console.log(body);
        printSeparator();
        if (!error && response.statusCode == 200) {
            getId();
        }
    });
}

function printSeparator(callback) {
    console.log('=====================================================================');
    if (callback) {
        callback(null, null);
    }
}

this.syncTimeTracker = syncTimeTracker;
module.exports = this;