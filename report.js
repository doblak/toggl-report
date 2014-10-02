var config = require('./config')
var TogglClient = require('toggl-api');
var toggl = new TogglClient({
    apiToken: config.apiToken
});
var Table = require('cli-table');
var _ = require('underscore');
_.str = require('underscore.string');
var XLSX = require('XLSX');
var moment = require('moment');

var togglReportData = [];

//recursively query all pages and fill togglReportData with time entries
var getTogglReportData = function(page) {
    toggl.detailedReport({
        workspace_id: config.workspaceId,
        since: config.since,
        until: config.until,
        //order_field: 'date', //currently sorting doesn't work
        //order_desc: 'off',
        page: page
    }, function(err, report) {
        if (err !== null)
            console.log("Err:", err);
        console.log("total_count: ", report.total_count);
        console.log("per_page: ", report.per_page);
        console.log('acquired page: ' + page);
        //print the whole JSON response:
        //console.log("Report: %j", report);

        //concatenate pages
        togglReportData = togglReportData.concat(report.data);

        if (page * report.per_page < report.total_count) {
            //request another page
            getTogglReportData(page + 1);
        } else {
            //fineshed, process data
            toggl.destroy();
            exportData();
        }
    });
};

getTogglReportData(1);

function exportData() {

    togglReportData = _.sortBy(togglReportData, function(entry) {
        return moment(entry.start).unix();
    });

    var head = ['Date', 'Hrs', 'Work Item', '', 'Cost center', 'Project'];

    var table = new Table({
        head: head,
        colWidths: [12, 7, 60, 15, 6, 5]
    });

    var exportTimeEntries = [];
    _.each(togglReportData, function(entry) {

        var tableEntry = [
            moment(entry.start).format('DD.MM.YYYY'),
            moment(entry.end).diff(moment(entry.start), 'hours', true),
            entry.description,
            config.projectTagToProjectNameAndIdLookup[entry.project] ? config.projectTagToProjectNameAndIdLookup[entry.project][0] : "?",
            7100,
            config.projectTagToProjectNameAndIdLookup[entry.project] ? config.projectTagToProjectNameAndIdLookup[entry.project][1] : "?",
        ];

        exportTimeEntries.push(tableEntry);
    });

    //group by costcenter/project
    entriesByCostCenterAndProject = _.groupBy(exportTimeEntries, function(entry) {
        return entry[4] + '/' + entry[5];
    });

    var exportSumEntries = [];
    //use counter since 'key' in each function is not sequential number
    var sumRowCounter = 0;
    _.each(entriesByCostCenterAndProject, function(groupEntries) {
        var sum = _.reduce(groupEntries, function(memo, entry) {
            return memo + entry[1];
        }, 0);
        var rowNb = 3 + exportTimeEntries.length + 6 + sumRowCounter++;
        var sumEntry = [
            '',
            sum,
            config.pricePerHour + ' €',
            '=B' + rowNb + '*C' + rowNb,
            groupEntries[0][4],
            groupEntries[0][5]
        ];

        exportSumEntries.push(sumEntry);
    });

    exportTimeEntries = [
        [moment(config.since).year() + '-' + moment(config.since).format('MM')],
        [],
        ['Date', 'Hrs', 'Work Item', '', 'Cost center', 'Project']
    ].concat(exportTimeEntries)
        .concat([
            ['SUM', '=SUM(B4:B' + (3 + exportTimeEntries.length) + ')'],
            [],
            [],
            [],
            ['Project / Work Item', 'Hours', 'Price/hour', 'Total', 'Cost center', 'Project']
        ]).concat(exportSumEntries)
        .concat([
            ['Total', '', '', '=SUM(D' + (3 + exportTimeEntries.length + 5 + 1) + ':D' + (3 + exportTimeEntries.length + 5 + exportSumEntries.length) + ')']
        ]);

    _.each(exportTimeEntries, function(entry) {
        table.push(entry);
    });

    console.log(table.toString());

    var ws_name = moment(config.since).year() + '-' + moment(config.since).format('MM');

    function Workbook() {
        if (!(this instanceof Workbook)) return new Workbook();
        this.SheetNames = [];
        this.Sheets = {};
    }

    var wb = new Workbook();
    var ws = sheet_from_array_of_arrays(exportTimeEntries);

    /* add worksheet to workbook */
    wb.SheetNames.push(ws_name);
    wb.Sheets[ws_name] = ws;

    /* write file */
    XLSX.writeFile(wb, ws_name + '.xlsx');
}

//credits: https://github.com/SheetJS/js-xlsx/blob/master/tests/write.js (a bit modified)
function sheet_from_array_of_arrays(data, opts) {
    var ws = {};
    var range = {
        s: {
            c: 10000000,
            r: 10000000
        },
        e: {
            c: 0,
            r: 0
        }
    };
    for (var R = 0; R != data.length; ++R) {
        for (var C = 0; C != data[R].length; ++C) {
            if (range.s.r > R) range.s.r = R;
            if (range.s.c > C) range.s.c = C;
            if (range.e.r < R) range.e.r = R;
            if (range.e.c < C) range.e.c = C;
            var cellData = data[R][C];
            var cell;
            var cell_ref = XLSX.utils.encode_cell({
                c: C,
                r: R
            });
            if (_.str.startsWith(cellData, "=")) {
                //TODO:  update xlsx lib when updated with this feature:
                //now formula only works since I edited the current module code (node_modules/xlsx/xlsx.js) andd added this feature:
                // https://github.com/christocracy/js-xlsx/commit/45f9e0198c10086f03dac000c09f24fe18bbd5d8
                //details: https://github.com/SheetJS/js-xlsx/pull/103
                cell = {
                    //f: _.str.strRight(cellData, '='),
                    f: cellData,
                    t: 'n'
                };
            } else {
                cell = {
                    v: cellData
                };
                if (cell.v === null) continue;


                if (typeof cell.v === 'number') cell.t = 'n';
                else if (typeof cell.v === 'boolean') cell.t = 'b';
                else if (cell.v instanceof Date) {
                    cell.t = 'n';
                    cell.z = XLSX.SSF._table[14];
                    cell.v = datenum(cell.v);
                } else cell.t = 's';
            }

            ws[cell_ref] = cell;
        }
    }
    if (range.s.c < 10000000) ws['!ref'] = XLSX.utils.encode_range(range);
    return ws;
}

//credits: https://github.com/SheetJS/js-xlsx/blob/master/tests/write.js
function datenum(v, date1904) {
    if (date1904) v += 1462;
    var epoch = Date.parse(v);
    return (epoch - new Date(Date.UTC(1899, 11, 30))) / (24 * 60 * 60 * 1000);
}