'use strict';

exports.__esModule = true;

var _off = require('dom-helpers/events/off');

var _off2 = _interopRequireDefault(_off);

var _on = require('dom-helpers/events/on');

var _on2 = _interopRequireDefault(_on);

var _scrollLeft = require('dom-helpers/query/scrollLeft');

var _scrollLeft2 = _interopRequireDefault(_scrollLeft);

var _scrollTop = require('dom-helpers/query/scrollTop');

var _scrollTop2 = _interopRequireDefault(_scrollTop);

var _requestAnimationFrame = require('dom-helpers/util/requestAnimationFrame');

var _requestAnimationFrame2 = _interopRequireDefault(_requestAnimationFrame);

var _Actions = require('history/lib/Actions');

var _DOMStateStorage = require('history/lib/DOMStateStorage');

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } } /* eslint-disable no-underscore-dangle */

// FIXME: Stop using this gross hack. This won't collide with any actual
// history location keys, but it's dirty to sneakily use the same storage here.
var KEY_PREFIX = 's/';

// Try at most this many times to scroll, to avoid getting stuck.
var MAX_SCROLL_ATTEMPTS = 2;

var ScrollBehavior = function () {
  function ScrollBehavior(history, getCurrentLocation, shouldUpdateScroll) {
    var _this = this;

    _classCallCheck(this, ScrollBehavior);

    this._onWindowScroll = function () {
      // It's possible that this scroll operation was triggered by what will be a
      // `POP` transition. Instead of updating the saved location immediately, we
      // have to enqueue the update, then potentially cancel it if we observe a
      // location update.
      if (_this._saveWindowPositionHandle === null) {
        _this._saveWindowPositionHandle = (0, _requestAnimationFrame2.default)(_this._saveWindowPosition);
      }

      if (_this._windowScrollTarget) {
        var _windowScrollTarget = _this._windowScrollTarget;
        var xTarget = _windowScrollTarget[0];
        var yTarget = _windowScrollTarget[1];

        var x = (0, _scrollLeft2.default)(window);
        var y = (0, _scrollTop2.default)(window);

        if (x === xTarget && y === yTarget) {
          _this._windowScrollTarget = null;
          _this._cancelCheckWindowScroll();
        }
      }
    };

    this._saveWindowPosition = function () {
      _this._saveWindowPositionHandle = null;

      _this._savePosition(null, window);
    };

    this._checkWindowScrollPosition = function () {
      _this._checkWindowScrollHandle = null;

      // We can only get here if scrollTarget is set. Every code path that unsets
      // scroll target also cancels the handle to avoid calling this handler.
      // Still, check anyway just in case.
      /* istanbul ignore if: paranoid guard */
      if (!_this._windowScrollTarget) {
        return;
      }

      var _windowScrollTarget2 = _this._windowScrollTarget;
      var x = _windowScrollTarget2[0];
      var y = _windowScrollTarget2[1];

      window.scrollTo(x, y);

      ++_this._numWindowScrollAttempts;

      /* istanbul ignore if: paranoid guard */
      if (_this._numWindowScrollAttempts >= MAX_SCROLL_ATTEMPTS) {
        _this._windowScrollTarget = null;
        return;
      }

      _this._checkWindowScrollHandle = (0, _requestAnimationFrame2.default)(_this._checkWindowScrollPosition);
    };

    this._history = history;
    this._getCurrentLocation = getCurrentLocation;
    this._shouldUpdateScroll = shouldUpdateScroll;

    // This helps avoid some jankiness in fighting against the browser's
    // default scroll behavior on `POP` transitions.
    /* istanbul ignore if: not supported by any browsers on Travis */
    if ('scrollRestoration' in window.history) {
      this._oldScrollRestoration = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    } else {
      this._oldScrollRestoration = null;
    }

    this._saveWindowPositionHandle = null;
    this._checkWindowScrollHandle = null;
    this._windowScrollTarget = null;
    this._numWindowScrollAttempts = 0;

    this._scrollElements = {};

    // We have to listen to each window scroll update rather than to just
    // location updates, because some browsers will update scroll position
    // before emitting the location change.
    (0, _on2.default)(window, 'scroll', this._onWindowScroll);

    this._unlistenBefore = history.listenBefore(function () {
      if (_this._saveWindowPositionHandle !== null) {
        _requestAnimationFrame2.default.cancel(_this._saveWindowPositionHandle);
        _this._saveWindowPositionHandle = null;
      }

      // It's fine to save element scroll positions here, though; the browser
      // won't modify them.
      Object.keys(_this._scrollElements).forEach(function (key) {
        _this._saveElementPosition(key);
      });
    });
  }

  ScrollBehavior.prototype.stop = function stop() {
    /* istanbul ignore if: not supported by any browsers on Travis */
    if (this._oldScrollRestoration) {
      window.history.scrollRestoration = this._oldScrollRestoration;
    }

    (0, _off2.default)(window, 'scroll', this._onWindowScroll);
    this._cancelCheckWindowScroll();

    this._unlistenBefore();
  };

  ScrollBehavior.prototype.registerElement = function registerElement(key, element, shouldUpdateScroll, context) {
    !!this._scrollElements[key] ? process.env.NODE_ENV !== 'production' ? (0, _invariant2.default)(false, 'ScrollBehavior: There is already an element registered for `%s`.', key) : (0, _invariant2.default)(false) : void 0;

    this._scrollElements[key] = { element: element, shouldUpdateScroll: shouldUpdateScroll };
    this._updateElementScroll(key, null, context);
  };

  ScrollBehavior.prototype.unregisterElement = function unregisterElement(key) {
    !this._scrollElements[key] ? process.env.NODE_ENV !== 'production' ? (0, _invariant2.default)(false, 'ScrollBehavior: There is no element registered for `%s`.', key) : (0, _invariant2.default)(false) : void 0;

    delete this._scrollElements[key];
  };

  ScrollBehavior.prototype.updateScroll = function updateScroll(prevContext, context) {
    var _this2 = this;

    this._updateWindowScroll(prevContext, context);

    Object.keys(this._scrollElements).forEach(function (key) {
      _this2._updateElementScroll(key, prevContext, context);
    });
  };

  ScrollBehavior.prototype.readPosition = function readPosition(location, key) {
    return (0, _DOMStateStorage.readState)(this._getKey(location, key));
  };

  ScrollBehavior.prototype._cancelCheckWindowScroll = function _cancelCheckWindowScroll() {
    if (this._checkWindowScrollHandle !== null) {
      _requestAnimationFrame2.default.cancel(this._checkWindowScrollHandle);
      this._checkWindowScrollHandle = null;
    }
  };

  ScrollBehavior.prototype._saveElementPosition = function _saveElementPosition(key) {
    var element = this._scrollElements[key].element;


    this._savePosition(key, element);
  };

  ScrollBehavior.prototype._savePosition = function _savePosition(key, element) {
    // We have to directly update `DOMStateStorage`, because actually updating
    // the location could cause e.g. React Router to re-render the entire page,
    // which would lead to observably bad scroll performance.
    (0, _DOMStateStorage.saveState)(this._getKey(this._getCurrentLocation(), key), [(0, _scrollLeft2.default)(element), (0, _scrollTop2.default)(element)]);
  };

  ScrollBehavior.prototype._getKey = function _getKey(location, key) {
    // Use fallback location key when actual location key is unavailable.
    var locationKey = location.key || this._history.createPath(location);

    return key == null ? '' + KEY_PREFIX + locationKey : '' + KEY_PREFIX + key + '/' + locationKey;
  };

  ScrollBehavior.prototype._updateWindowScroll = function _updateWindowScroll(prevContext, context) {
    // Whatever we were doing before isn't relevant any more.
    this._cancelCheckWindowScroll();

    this._windowScrollTarget = this._getScrollTarget(null, this._shouldUpdateScroll, prevContext, context);

    // Check the scroll position to see if we even need to scroll. This call
    // will unset _windowScrollTarget if the current scroll position matches
    // the target.
    this._onWindowScroll();

    if (!this._windowScrollTarget) {
      return;
    }

    // Updating the window scroll position is really flaky. Just trying to
    // scroll it isn't enough. Instead, try to scroll a few times until it
    // works.
    this._numWindowScrollAttempts = 0;
    this._checkWindowScrollPosition();
  };

  ScrollBehavior.prototype._updateElementScroll = function _updateElementScroll(key, prevContext, context) {
    var _scrollElements$key = this._scrollElements[key];
    var element = _scrollElements$key.element;
    var shouldUpdateScroll = _scrollElements$key.shouldUpdateScroll;


    var scrollTarget = this._getScrollTarget(key, shouldUpdateScroll, prevContext, context);
    if (!scrollTarget) {
      return;
    }

    // Unlike with the window, there shouldn't be any flakiness to deal with
    // here.
    var x = scrollTarget[0];
    var y = scrollTarget[1];

    (0, _scrollLeft2.default)(element, x);
    (0, _scrollTop2.default)(element, y);
  };

  ScrollBehavior.prototype._getScrollTarget = function _getScrollTarget(key, shouldUpdateScroll, prevContext, context) {
    var scrollTarget = shouldUpdateScroll ? shouldUpdateScroll.call(this, prevContext, context) : true;

    if (!scrollTarget || Array.isArray(scrollTarget)) {
      return scrollTarget;
    }

    var location = this._getCurrentLocation();
    if (location.action === _Actions.PUSH) {
      return [0, 0];
    }

    return this.readPosition(location, key) || [0, 0];
  };

  return ScrollBehavior;
}();

exports.default = ScrollBehavior;
module.exports = exports['default'];
