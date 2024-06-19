import {VisPluginTableModel} from './vis_table_plugin';
import * as d3 from './d3loader';

const themes = {
  traditional: require('./theme_traditional.css'),
  looker: require('./theme_looker.css'),
  contemporary: require('./theme_contemporary.css'),

  fixed: require('./layout_fixed.css'),
  auto: require('./layout_auto.css'),
};

const BBOX_X_ADJUST = 10;
const BBOX_Y_ADJUST = 10;

const use_minicharts = false;

const removeStyles = async function () {
  const links = document.getElementsByTagName('link');
  while (links[0]) links[0].parentNode.removeChild(links[0]);

  Object.keys(themes).forEach(async theme => await themes[theme].unuse());
};

const loadStylesheet = function (link) {
  const linkElement = document.createElement('link');

  linkElement.setAttribute('rel', 'stylesheet');
  linkElement.setAttribute('href', link);

  document.getElementsByTagName('head')[0].appendChild(linkElement);
};

const formatDate = function (dateString) {
  const date = new Date(dateString);
  const options = {year: '2-digit', month: 'short'};
  return date.toLocaleDateString('en-US', options);
};

const buildReportTable = function (
  config,
  dataTable,
  updateColumnOrder,
  element
) {
  var dropTarget = null;
  const bounds = element.getBoundingClientRect();
  const chartCentreX = bounds.x + bounds.width / 2;
  const chartCentreY = bounds.y + bounds.height / 2;

  removeStyles().then(() => {
    if (
      typeof config.customTheme !== 'undefined' &&
      config.customTheme &&
      config.theme === 'custom'
    ) {
      loadStylesheet(config.customTheme);
    } else if (typeof themes[config.theme] !== 'undefined') {
      themes[config.theme].use();
    }
    if (typeof themes[config.layout] !== 'undefined') {
      themes[config.layout].use();
    }
  });

  const renderTable = async function () {
    const getTextWidth = function (text, font = '') {
      var canvas =
        getTextWidth.canvas ||
        (getTextWidth.canvas = document.createElement('canvas'));
      var context = canvas.getContext('2d');
      context.font = font || config.bodyFontSize + 'pt arial';
      var metrics = context.measureText(text);
      return metrics.width;
    };

    var table = d3
      .select('#visContainer')
      .append('table')
      .attr('id', 'reportTable')
      .attr('class', 'reportTable')
      .style('opacity', 0);

    var drag = d3
      .drag()
      .on('start', (source, idx) => {
        if (!dataTable.has_pivots && source.colspan === 1) {
          var xPosition = parseFloat(d3.event.x);
          var yPosition = parseFloat(d3.event.y);
          var html = source.column.getHeaderCellLabelByType('field');

          d3.select('#tooltip')
            .style('left', xPosition + 'px')
            .style('top', yPosition + 'px')
            .html(html);

          d3.select('#tooltip').classed('hidden', false);
        }
      })
      .on('drag', (source, idx) => {
        if (!dataTable.has_pivots) {
          d3.select('#tooltip')
            .style('left', d3.event.x + 'px')
            .style('top', d3.event.y + 'px');
        }
      })
      .on('end', (source, idx) => {
        if (!dataTable.has_pivots) {
          d3.select('#tooltip').classed('hidden', true);
          var movingColumn = source.column;
          var targetColumn = dropTarget.column;
          var movingIdx = Math.floor(movingColumn.pos / 10) * 10;
          var targetIdx = Math.floor(targetColumn.pos / 10) * 10;
          dataTable.moveColumns(movingIdx, targetIdx, updateColumnOrder);
        }
      });

    var table_rows = table
      .append('tbody')
      .selectAll('tr')
      .data(dataTable.getDataRows())
      .enter()
      .append('tr')
      .on('mouseover', function () {
        if (dataTable.showHighlight) {
          this.classList.toggle('hover');
        }
      })
      .on('mouseout', function () {
        if (dataTable.showHighlight) {
          this.classList.toggle('hover');
        }
      })
      .selectAll('td')
      .data(row =>
        dataTable.getTableRowColumns(row).map(column => row.data[column.id])
      )
      .enter();

    table_rows
      .append('td')
      .text(d => {
        var text = '';
        if (Array.isArray(d.value)) {
          text = !(d.rendered === null) ? d.rendered : d.value.join(' ');
        } else if (
          typeof d.value === 'object' &&
          d.value !== null &&
          typeof d.value.series !== 'undefined'
        ) {
          text = null;
        } else if (d.html) {
          var parser = new DOMParser();
          var parsed_html = parser.parseFromString(d.html, 'text/html');
          text = parsed_html.documentElement.textContent;
        } else if (d.rendered || d.rendered === '') {
          text = d.rendered;
        } else {
          text = d.value;
        }

        if (typeof text === 'string' && !isNaN(Date.parse(text))) {
          text = formatDate(text);
        }

        return text ? text.replace('-', '\u2011') : text;
      })
      .attr('class', d => {
        var classes = ['reportTable'];
        if (typeof d.value === 'string' && !isNaN(Date.parse(d.value))) {
          classes.push('dateColumn');
        }
        return classes.join(' ');
      });

    if (use_minicharts) {
      var barHeight = 16;
      var minicharts = table
        .selectAll('.cellSeries')
        .append('svg')
        .attr('height', d => barHeight)
        .attr('width', '100%')
        .append('g')
        .attr('class', '.cellSeriesChart')
        .selectAll('rect')
        .data(d => {
          values = [];
          for (var i = 0; i < d.value.series.keys.length; i++) {
            values.push({
              idx: i,
              max: 10000,
              key: d.value.series.keys[i],
              value: d.value.series.values[i],
              type: d.value.series.types[i],
            });
          }
          return values.filter(value => value.type === 'line_item');
        })
        .enter();

      var cellWidth = table.selectAll('.cellSeries')._groups[0][0].clientWidth;
      var barWidth = Math.floor(cellWidth / 10);

      minicharts
        .append('rect')
        .style('fill', 'steelblue')
        .attr('x', value => {
          return value.idx * barWidth;
        })
        .attr(
          'y',
          value => barHeight - Math.floor((value.value / value.max) * barHeight)
        )
        .attr('width', barWidth)
        .attr('height', value =>
          Math.floor((value.value / value.max) * barHeight)
        );
    }
  };

  const addOverlay = async function () {
    var viewbox_width = document.getElementById('reportTable').clientWidth;
    var viewbox_height = document.getElementById('reportTable').clientHeight;

    var allRects = [];
    d3.selectAll('th').select(function (d, i) {
      if (typeof d !== 'undefined') {
        var bbox = this.getBoundingClientRect();
        allRects.push({
          index: i,
          data: d,
          x: bbox.x - BBOX_X_ADJUST,
          y: bbox.y - BBOX_Y_ADJUST,
          width: bbox.width,
          height: bbox.height,
          html: this.innerHTML,
          class: this.className + ' rectElem animated',
          fontSize: config.headerFontSize,
          align: this.style.textAlign,
        });
      }
    });

    d3.selectAll('td').select(function (d, i) {
      if (typeof d !== 'undefined') {
        var bbox = this.getBoundingClientRect();
        allRects.push({
          index: i,
          data: d,
          x: bbox.x - BBOX_X_ADJUST,
          y: bbox.y - BBOX_Y_ADJUST,
          width: bbox.width,
          height: bbox.height,
          html: this.innerHTML,
          class: this.className + ' rectElem animated',
          fontSize: config.bodyFontSize,
          align: this.style.textAlign,
        });
      }
    });

    var overlay = d3
      .select('#visSvg')
      .attr('width', viewbox_width)
      .attr('height', viewbox_height)
      .selectAll('.rectElem')
      .data(allRects, d => d.data.id)
      .join(
        enter =>
          enter
            .append('div')
            .attr('class', d => d.class)
            .style('opacity', 0.2)
            .style('position', 'absolute')
            .style('left', d => d.x + 'px')
            .style('top', d => -2000)
            .style('width', d => d.width + 'px')
            .style('height', d => d.height + 'px')
            .style('font-size', d => d.fontSize + 'px')
            .style('text-align', d => d.align)
            .text(d => d.html)
            .call(enter =>
              enter
                .transition()
                .duration(1000)
                .style('opacity', 1)
                .style('top', d => d.y + 'px')
            ),
        update =>
          update.call(update =>
            update
              .transition()
              .duration(1000)
              .attr('class', d => d.class)
              .style('opacity', 1)
              .style('left', d => d.x + 'px')
              .style('top', d => d.y + 'px')
              .style('width', d => d.width + 'px')
              .style('height', d => d.height + 'px')
              .style('font-size', d => d.fontSize + 'px')
              .style('text-align', d => d.align)
              .text(d => d.html)
          ),
        exit =>
          exit.call(exit =>
            exit.transition().duration(500).style('opacity', 0).remove()
          )
      );
  };

  renderTable().then(() => {
    document.getElementById('reportTable').classList.add('reveal');
    if (config.customTheme === 'animate') {
      document.getElementById('visSvg').classList.remove('hidden');
      addOverlay();
    } else {
      document.getElementById('visSvg').classList.add('hidden');
      document.getElementById('reportTable').style.opacity = 1;
    }
  });
};

looker.plugins.visualizations.add({
  options: VisPluginTableModel.getCoreConfigOptions(),

  create: function (element, config) {
    this.svgContainer = d3
      .select(element)
      .append('div')
      .attr('id', 'visSvg')
      .attr('width', element.clientWidth)
      .attr('height', element.clientHeight);

    this.tooltip = d3
      .select(element)
      .append('div')
      .attr('id', 'tooltip')
      .attr('class', 'hidden');
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    const updateColumnOrder = newOrder => {
      this.trigger('updateConfig', [{columnOrder: newOrder}]);
    };

    this.clearErrors();

    if (queryResponse.fields.pivots.length > 2) {
      this.addError({
        title: 'Max Two Pivots',
        message: 'This visualization accepts no more than 2 pivot fields.',
      });
      return;
    }

    if (!data.length) {
      this.addError({
        title: 'No Results',
      });
      return;
    }

    try {
      var elem = document.querySelector('#visContainer');
      elem.parentNode.removeChild(elem);
    } catch (e) {}

    this.container = d3
      .select(element)
      .append('div')
      .attr('id', 'visContainer');

    if (typeof config.columnOrder === 'undefined') {
      this.trigger('updateConfig', [{columnOrder: {}}]);
    }

    if (typeof config.theme === 'undefined') {
      config = Object.assign(
        {
          bodyFontSize: 12,
          headerFontSize: 12,
          theme: 'traditional',
          showHighlight: true,
          showTooltip: true,
        },
        config
      );
    }

    var dataTable = new VisPluginTableModel(data, queryResponse, config);
    this.trigger('registerOptions', dataTable.getConfigOptions());
    buildReportTable(config, dataTable, updateColumnOrder, element);

    done();
  },
});
