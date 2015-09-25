
var _ = require("lodash");

exports.makeReportsDef = function(columns) {
	return _.map(columns, function(c) { return {cn: c, lbl: c}; });
}


exports.listColumns=function(json) {
  var cols = _.reduce(json, function(m,x) {
    if(_.isObject(x)) {
      _.each(x, function(v,k) { m[k] = true; });
    }
    return m;
  },{});
  return _.keys(cols);
}

exports.convertJSONToCSV = function (json, reportDef, sep) {
  function csvCell(value,rgxp) {
    if(_.isUndefined(value) || _.isNull(value)) return "";
    value = value.toString();
    if(value.match(rgxp)) {
      // the value must be surrounded by double quotes (unless it is already)
      if(value.match(/^".*"$/)) return value;
      // if it contains double quotes, the double quotes must be doubled
      value = value.replace(/"/g, '""');
      return '"'+value+'"';
    }
    return value;
  }
  // CSV or ... other separator (tab?)
  if(!sep) sep = ',';
  var rgxp = new RegExp(sep+ "|\n");

  var columnNames = _.pluck(reportDef, 'cn');
  var headerRow = _.map(reportDef, function(C) {
    if(C.lbl) {
      return csvCell(C.lbl,rgxp);
    }else{
      return csvCell(C.cn,rgxp);
    }
  });

  var resultsString = headerRow.join(sep) + "\n";

  if(_.size(json)==0) { json = {} }

  _.each(json,  function (record) {

            var line = '';
           _.each(columnNames, function(key, i)
           {
           
            if (line != '' || i>0) {
                line += sep;
            }
         
            if (record[key] != null && record[key] != undefined) {
              line += csvCell(record[key],rgxp);                
             }else{

             }
        });
        line += "\n";
        resultsString += line;
  });

  return resultsString;
}