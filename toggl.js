var config = require('./config');

//https://github.com/7eggs/node-toggl-api
var TogglClient = require('toggl-api');

var toggl = new TogglClient({
    apiToken: config.apiToken
});
var _ = require('underscore');

var togglReportData = [];

//recursively query all pages and fill togglReportData with time entries
//https://github.com/toggl/toggl_api_docs/blob/master/reports/detailed.md
//https://github.com/toggl/toggl_api_docs/blob/master/reports.md#request-parameters
function getData(callback, pageParam) {
    var page = pageParam;
    if (_.isUndefined(page)) {
        page = 1;
    }
    toggl.detailedReport({
        workspace_id: config.workspaceId,
        since: config.from,
        until: config.to,
        //order_field: 'date', //currently sorting doesn't work
        //order_desc: 'off',
        page: page
    }, function(err, report) {
        if (err !== null){
            console.log("Err: ", err);
            callback("Failed to retrieve toggl data: " + err, null);
        }
        console.log("total_count: ", report.total_count);
        console.log("per_page: ", report.per_page);
        console.log('acquired page: ' + page);
        //print the whole JSON response:
        //console.log("Report: %j", report);

        //concatenate pages
        togglReportData = togglReportData.concat(report.data);

        if (page * report.per_page < report.total_count) {
            //request another page
            getData(callback, page + 1);
        } else {
            //fineshed, process data
            toggl.destroy();
            callback(null, togglReportData);
        }
    });
}

this.getData = getData;
module.exports = this;