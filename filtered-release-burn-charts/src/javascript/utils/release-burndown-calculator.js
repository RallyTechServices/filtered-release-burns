/*
 * This burnup calculator only looks at PIs
 * 
 */
Ext.define('CA.technicalservices.ReleaseBurndownCalculator',{
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        usePoints: true
    },

    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
    },
    
    runCalculation: function (snapshots) {
        var calculatorConfig = this._prepareCalculatorConfig(),
            seriesConfig = this._buildSeriesConfig(calculatorConfig);

        var calculator = this.prepareCalculator(calculatorConfig);
        calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));

        var chart_data = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
        
        chart_data = this._removeAfterToday(chart_data);

        return chart_data;
    },
    
    getDerivedFieldsOnInput: function() {
        var usePoints = this.usePoints;

        var fields = [{
            "as": "__ToDo",
            "f": function(snapshot) {
                if (usePoints){
                    var total_points = snapshot.LeafStoryPlanEstimateTotal || 0;
                    var accepted_points = snapshot.AcceptedLeafStoryPlanEstimateTotal || 0;
                    
                    return total_points - accepted_points;
                } else {
                    var total_count = snapshot.LeafStoryCount || 0;
                    var accepted_count = snapshot.AcceptedLeafStoryCount || 0;
                    return total_count - accepted_count;
                }
            }
        }];

        
        fields.push({
            "as": '__Accepted',
            "f": function(snapshot) {
                if (usePoints){
                    return snapshot.AcceptedLeafStoryPlanEstimateTotal || 0;
                } else {
                    return snapshot.AcceptedLeafStoryCount || 0;
                }
            }
        });

        return fields;
    },
    
    getMetrics: function() {
        var metrics = [];

        metrics.push({
            "field": '__Accepted',
            'as':'Accepted',
            "f": "sum",
            'display': 'line'
        });

        metrics.push({
            "field": "__ToDo",
            'as': 'To Do',
            "f": "sum",
            'display':'line'
        });

        return metrics;
    },

    getSummaryMetricsConfig: function () {
        return [
            {
                'as': '__maxScope',
                'f': function(seriesData) {                
                    var max = 0, i = 0;
                    
                    Ext.Array.each(seriesData, function(datum){
                        var todo = datum['To Do'] || 0;
                        var done = datum['Accepted'] || 0;
                        var scope = todo + done;
                        
                        if ( scope > max ) {
                            max = scope;
                        }
                    });
                    
                    return max;
                 }
            }
        ];
    },

    getDerivedFieldsAfterSummary: function () {
        return  [
            {
                "as": "Ideal",
                "f": function (row, index, summaryMetrics, seriesData) {
                    var max = summaryMetrics.__maxScope,
                        increments = seriesData.length - 1,
                        incrementAmount;
                    if(increments === 0) {
                        return max;
                    }
                    incrementAmount = max / increments;
                    return Math.floor(100 * (max - index * incrementAmount)) / 100;
                },
                "display": "line"
            }
        ];
    },
    
    _getQuarterStringFor: function(jsdate) {
        var month = jsdate.getMonth();
        var quarter = parseInt(month/3) + 1;
        
        return Ext.util.Format.date(jsdate,'Y') + "Q" + quarter;
    },
    
    _removeAfterToday: function(chart_data) {
        var today = new Date();
        
        var today_string = Rally.util.DateTime.toIsoString(today).replace(/T.*$/,'');
        if ( this.granularity == 'quarter' ) {
            today_string = this._getQuarterStringFor(today);
        }

        var full_categories = Ext.Array.filter(chart_data.categories, function(category){
            return ( category <= today_string );
        });
        
        var length = full_categories.length;

        var series_group = Ext.Array.map(chart_data.series, function(series) {
            console.log(series);
            if ( series.name == "Ideal" ) { return series; }
            
            var data = [];
            Ext.Array.each(series.data, function(datum,index){
                
                if ( index >= length ) {
                    datum = null;
                }
                data.push(datum);
            });
           
            // this format is to prevent the series from being modified:
            return Ext.Object.merge( {}, series, { data: data } );
        });
        
        
        return { 
            categories: chart_data.categories, 
            series: series_group 
        };
            
    }
});
