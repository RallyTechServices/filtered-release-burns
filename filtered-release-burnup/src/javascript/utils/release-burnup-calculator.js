Ext.define('CA.technicalservices.ReleaseBurnupCalculator',{
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
        
        console.log(chart_data, this._getStartDate(snapshots));
        chart_data = this._removeAfterToday(chart_data);

        return chart_data;
    },
    
    getDerivedFieldsOnInput: function() {
        var usePoints = this.usePoints;

        var fields = [{
            "as": "__Planned",
            "f": function(snapshot) {
                if (usePoints){
                    return snapshot.PlanEstimate || 0;
                } else {
                    return 1;
                }
            }
        }];

        
        fields.push({
            "as": '__Accepted',
            "f": function(snapshot) {
                if (!Ext.isEmpty(snapshot.AcceptedDate)) {
                    if (usePoints){
                        return snapshot.PlanEstimate || 0;
                    } else {
                        return 1;
                    }
                }
                return 0;
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
            'display': 'column'
        });

        metrics.push({
            "field": "__Planned",
            'as': 'Planned',
            "f": "sum",
            'display':'line'
        });

        return metrics;
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
