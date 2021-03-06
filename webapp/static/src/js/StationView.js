import WeatherIcons from "./weatherIcons.js";
import config from "./config.js";
import model from "./model.js";
const d3 = require("d3");
const Pikaday = require("pikaday");
import { store } from "./store.js";
import { selectDate, selectOverview, showEvents } from "./actions";

export default class StationView {
  static init() {
    this.stationName = document.getElementById("stationName");

    this.datePicker = new Pikaday({
      field: document.getElementById("datepicker"),
      onSelect: date => store.dispatch(selectDate(date)),
      minDate: config.firstDate,
      maxDate: config.lastDate,
      defaultDate: config.firstDate,
      setDefaultDate: true
    });

    //create table rows for the timeline
    var timelineElement = document.getElementById("timeline");
    this.timeline = {};
    for (var hour = 0; hour < 24; ++hour) {
      var timelineItem = document.createElement("div");
      timelineItem.className += "table-row";

      var hourData = document.createElement("div");
      hourData.innerHTML = hour;
      hourData.className += "table-column hourCell";
      timelineItem.appendChild(hourData);

      var weatherSummaryData = document.createElement("div");
      weatherSummaryData.className += "table-column weatherSummaryCell";
      var weatherItem = document.createElement("i");
      weatherSummaryData.appendChild(weatherItem);
      var weatherSummaryText = document.createElement("div");
      weatherSummaryData.appendChild(weatherSummaryText);
      timelineItem.appendChild(weatherSummaryData);

      var apparentTempData = document.createElement("div");
      apparentTempData.className += "table-column temperatureCell";
      timelineItem.appendChild(apparentTempData);

      var windSpeedData = document.createElement("div");
      windSpeedData.className += "table-column windSpeedCell";
      timelineItem.appendChild(windSpeedData);

      var stationEventData = document.createElement("div");
      stationEventData.className += "table-column stationEventCell";
      stationEventData.id = "stationEvent" + hour;
      timelineItem.appendChild(stationEventData);

      var stationCriticalData = document.createElement("div");
      stationCriticalData.className += "table-column stationCriticalCell";
      timelineItem.appendChild(stationCriticalData);

      timelineElement.appendChild(timelineItem);

      this.timeline[hour] = {
        weatherIcon: weatherItem,
        apparentTemperature: apparentTempData,
        windSpeed: windSpeedData,
        weatherSummaryText: weatherSummaryText,
        stationEvent: stationEventData,
        stationCritical: stationCriticalData
      };
    }

    this.backButton = document.getElementById("backButton");
    this.backButton.onclick = () => store.dispatch(selectOverview());

    //create tooltip for d3 charts
    this.d3TooltipDiv = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);

    //observe state for rerender
    store.observeStore(
      (oldState, currentState) => {
        if (currentState.showOverview) {
          if (!currentState.isFetchingOverviewData) {
            this.renderHeader();
            this.renderOverviewTimeline();
          }
        } else {
          if (!currentState.isFetchingStationData) {
            this.renderHeader(currentState.selectedStationId);
            this.renderStationTimeline();
          }
        }

        if (
          oldState.isFetchingOverviewData &&
          !currentState.isFetchingOverviewData
        ) {
          //when overview data was loaded
          this.renderWeatherTimeline();
        }
      },
      state => {
        return {
          isFetchingOverviewData: state.isFetchingOverviewData,
          isFetchingStationData: state.isFetchingStationData,
          showOverview: state.showOverview,
          selectedStationId: state.selectedStationId,
          showEvents: state.showEvents,
          selectedHour: state.selectedHour
        };
      },
      this
    );
  }

  static renderHeader(selectedStationId = null) {
    if (selectedStationId !== null) {
      this.stationName.innerHTML = model.getStation(selectedStationId).name;
      this.backButton.classList.add("show");
    } else {
      this.stationName.innerHTML = "Overview";
      this.backButton.classList.remove("show");
    }
  }

  static renderWeatherTimeline() {
    var weather = model.getWeather();
    for (var hour in this.timeline) {
      var timelineItem = this.timeline[hour];
      var weatherItem = weather[hour];

      WeatherIcons.map(weatherItem.icon, timelineItem.weatherIcon);
      timelineItem.apparentTemperature.innerHTML =
        weatherItem.apparentTemperature;
      timelineItem.windSpeed.innerHTML = weatherItem.windSpeed;
      timelineItem.weatherSummaryText.innerHTML = weatherItem.summary;
    }
  }

  static renderOverviewTimeline() {
    //clear entries
    for (var hour in this.timeline) {
      var timelineItem = this.timeline[hour];
      while (timelineItem.stationEvent.firstChild) {
        timelineItem.stationEvent.removeChild(
          timelineItem.stationEvent.firstChild
        );
      }
      while (timelineItem.stationCritical.firstChild) {
        timelineItem.stationCritical.removeChild(
          timelineItem.stationCritical.firstChild
        );
      }
    }

    //render in/out bars
    var predictedValues;
    var realValues;
    var maximumValues;
    ({
      realValues,
      predictedValues,
      maximumValues
    } = model.getAggregatedData());
    for (var hour in predictedValues) {
      var timelineItem = this.timeline[hour];
      var predicted = predictedValues[hour];
      var real = realValues[hour];

      this.renderBars(
        hour,
        predicted.arrivals,
        predicted.departures,
        real.arrivals,
        real.departures,
        maximumValues.arrivals,
        maximumValues.departures
      );
    }

    //collect hours with critcal events
    var eventingStationsHour = store.getState().state.selectedHour;
    var stationEvents = model.getEvents();
    var criticalHours = new Set();
    for (var index in stationEvents) {
      criticalHours.add(stationEvents[index].hour);
    }

    //loop critical hours and set button with icon
    criticalHours.forEach(hour => {
      var timelineItem = this.timeline[hour];

      var eventButton = document.createElement("a");
      if (hour === eventingStationsHour) {
        eventButton.className +=
          "fa fa-exclamation-triangle fa-2x fa-inverse eventButtonPressed";
      } else {
        eventButton.className += "fa fa-exclamation-triangle fa-2x eventButton";
      }

      eventButton.onclick = (hour => {
        return () => {
          if (store.getState().state.selectedHour === hour) {
            store.dispatch(showEvents(false, null));
          } else {
            store.dispatch(showEvents(true, hour));
          }
        };
      })(hour);

      timelineItem.stationCritical.appendChild(eventButton);
    });

    this.backButton.disabled = true;
  }

  static renderStationTimeline() {
    var predictedValues;
    var realValues;
    var maximumValues;
    ({ realValues, predictedValues, maximumValues } = model.getStationData());
    for (var hour in predictedValues) {
      var hour = parseInt(hour);
      var timelineItem = this.timeline[hour];
      var predicted = predictedValues[hour];
      var real = realValues[hour];

      //remove entries
      while (timelineItem.stationEvent.firstChild) {
        timelineItem.stationEvent.removeChild(
          timelineItem.stationEvent.firstChild
        );
      }

      while (timelineItem.stationCritical.firstChild) {
        timelineItem.stationCritical.removeChild(
          timelineItem.stationCritical.firstChild
        );
      }

      //render in/out bars
      this.renderBars(
        hour,
        predicted.arrivals,
        predicted.departures,
        real.arrivals,
        real.departures,
        maximumValues.arrivals,
        maximumValues.departures
      );

      //set button with icon for critical events
      if (Math.abs(predicted.flow) > config.eventThreshold) {
        var eventIcon = document.createElement("i");
        eventIcon.className += "fa fa-exclamation-triangle fa-2x";
        eventIcon.style.color = "darkred";
        timelineItem.stationCritical.appendChild(eventIcon);
      }
    }

    //enable back button
    this.backButton.disabled = false;
  }

  static renderBars(
    hour,
    predictedIn,
    predictedOut,
    realIn,
    realOut,
    numberMaxIn,
    numberMaxOut
  ) {
    //compute maximum number and scale everything to interval [0, 1]
    var inOutMax = Math.max(numberMaxIn, numberMaxOut);
    var scaledPredictedIn = inOutMax > 0 ? predictedIn / inOutMax : 0;
    var scaledPredictedOut = inOutMax > 0 ? predictedOut / inOutMax : 0;
    var scaledRealIn = inOutMax > 0 ? realIn / inOutMax : 0;
    var scaledRealOut = inOutMax > 0 ? realOut / inOutMax : 0;

    if (predictedIn + predictedOut > 0) {
      var chart = d3
        .select("#stationEvent" + hour)
        .append("svg")
        .attr("width", "100%")
        .attr("height", 30);

      //horizontal divider
      chart
        .append("line")
        .attr("x1", 1)
        .attr("y1", 1)
        .attr("x2", 1)
        .attr("y2", 29)
        .attr("stroke-width", 1)
        .attr("stroke", "gray");

      //vertical 0 line
      chart
        .append("line")
        .attr("x1", 1)
        .attr("y1", 14)
        .attr("x2", "100%")
        .attr("y2", 14)
        .attr("stroke-width", 1)
        .attr("stroke", "gray");

      //real arrivals marker
      chart
        .append("line")
        .attr("x1", scaledRealIn * 100 + "%")
        .attr("y1", 1)
        .attr("x2", scaledRealIn * 100 + "%")
        .attr("y2", 13)
        .attr("stroke-width", 1)
        .attr("stroke", "black");

      //real departures marker
      chart
        .append("line")
        .attr("x1", scaledRealOut * 100 + "%")
        .attr("y1", 15)
        .attr("x2", scaledRealOut * 100 + "%")
        .attr("y2", 29)
        .attr("stroke-width", 1)
        .attr("stroke", "black");

      //predicted arrivals bar
      chart
        .append("rect")
        .attr("x", 1)
        .attr("y", 4)
        .attr("width", scaledPredictedIn * 100 + "%")
        .attr("height", 9)
        .style("fill", "darkgreen");

      //predicted departures bar
      chart
        .append("rect")
        .attr("x", 1)
        .attr("y", 15)
        .attr("width", scaledPredictedOut * 100 + "%")
        .attr("height", 9)
        .style("fill", "firebrick");

      //set tooltip text
      chart.on(
        "mouseover",
        ((predictedIn, predictedOut, realIn, realOut) => {
          return () => {
            var inDeltaPercentage =
              realIn > 0
                ? Math.round((realIn - predictedIn) / realIn * 1000) / 10 + "%"
                : "NaN";
            var outDeltaPercentage =
              realOut > 0
                ? Math.round((realOut - predictedOut) / realOut * 1000) / 10 +
                  "%"
                : "NaN";

            StationView.d3TooltipDiv
              .transition()
              .duration(200)
              .style("opacity", 0.9);
            StationView.d3TooltipDiv
              .html(
                "<b>Arrivals: </b>" +
                  predictedIn +
                  " (" +
                  realIn +
                  ", " +
                  inDeltaPercentage +
                  ")" +
                  "</br><b>Departures: </b>" +
                  predictedOut +
                  " (" +
                  realOut +
                  ", " +
                  outDeltaPercentage +
                  ")"
              )
              .style("left", d3.event.pageX + "px")
              .style("top", d3.event.pageY - 28 + "px");
          };
        })(predictedIn, predictedOut, realIn, realOut)
      );

      chart.on("mouseout", function() {
        StationView.d3TooltipDiv
          .transition()
          .duration(500)
          .style("opacity", 0);
      });
    }
  }
}
