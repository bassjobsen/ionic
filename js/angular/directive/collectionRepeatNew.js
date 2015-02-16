(function() {

/************************************************
## TODO ##

- [ ] Public documentation (mostly copy/paste of old documentation)
- [ ] Unit tests
- [ ] Figure out a way to give render stats, but only in development mode
- [ ] Add refresh-images attribute, or perhaps make it always on if it's actually faster
      (needs more testing)
- [ ] Should we support horizontal scrolling?
- [ ] Add errors for trying to setup collection-repeat on an x & y scrolling view.
- [ ] Add support for elements before and after the repeater.

***********************************************/

IonicModule
.directive('collectionRepeat', CollectionRepeatDirective)
.factory('$ionicCollectionManager', RepeatManagerFactory);

var ONE_PX_TRANSPARENT_IMG_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function CollectionRepeatDirective($ionicCollectionManager, $parse, $window, $$rAF) {
  return {
    restrict: 'A',
    priority: 1000,
    transclude: 'element',
    $$tlb: true,
    require: '^$ionicScroll',
    link: postLink
  };

  function postLink(scope, element, attr, scrollCtrl, transclude) {

    var scrollView = scrollCtrl.scrollView;
    var node = element[0];
    var container = angular.element('<div class="collection-repeat-container">');
    node.parentNode.replaceChild(container[0], node);

    var match = attr.collectionRepeat.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+track\s+by\s+([\s\S]+?))?\s*$/);
    if (!match) {
      throw new Error("collection-repeat expected expression in form of '_item_ in " +
                      "_collection_[ track by _id_]' but got '" + attr.collectionRepeat + "'.");
    }
    var keyExpr = match[1];
    var listExpr = match[2];
    var heightData = {};
    var widthData = {};
    var computedStyleDimensions = {};
    var repeatManager;

    if (!attr.collectionItemHeight && !attr.collectionItemWidth) {
      heightData.computed = widthData.computed = true;
    } else {
      if (attr.collectionItemHeight) {
        parseDimensionAttr(attr.collectionItemHeight, heightData);
      } else {
        heightData.computed = true;
      }
      if (!attr.collectionItemWidth) attr.collectionItemWidth = '100%';
      parseDimensionAttr(attr.collectionItemWidth, widthData);
    }

    scrollCtrl.$element.one('scroll.init', refreshDimensions);
    ionic.on('resize', validateResize, window);


      computedStyleNode && computedStyleNode.parentNode &&
        computedStyleNode.parentNode.removeChild(computedStyleNode);
      computedStyleScope && computedStyleScope.$destroy();
      ionic.off('resize', validateResize, window);
    });
    scope.$on('$ionic.reconnectScope', function() {
      if (refreshDimensions.queued) refreshDimensions();
    });

    // Make sure this resize actually changed the size of the screen
    function validateResize() {
      var h = window.innerHeight || screen.height, w = window.innerWidth || screen.width;
      if (validateResize.height !== h || validateResize.width !== w) {
        refreshDimensions();
      }
      validateResize.height = h;
      validateResize.width = w;
    }
    function refreshDimensions() {
      // If we're disconnected, don't refresh the dimensions. But mark that we need to once
      // the scope reconnects.
      if (scope.$$disconnected) return (refreshDimensions.queued = true);
      refreshDimensions.queued = false;

      if (heightData.computed || widthData.computed) {
        computeStyleDimensions();
      }

      if (heightData.computed) {
        heightData.value = computedStyleDimensions.height;
      } else if (heightData.dynamic) {
        // do nothing on resize except recalculate everything for dynamic heights
      } else if (heightData.getValue) {
        // If it's a constant with a getter (eg percent), we just refresh .value after resize
        heightData.value = heightData.getValue();
      }

      if (widthData.computed) {
        widthData.value = computedStyleDimensions.width;
      } else if (widthData.dynamic) {
      } else if (widthData.getValue) {
        widthData.value = widthData.getValue();
      }

      repeatManager || (repeatManager = new $ionicCollectionManager({
        scope: scope,
        containerNode: container[0],
        data: $parse(listExpr)(scope),
        keyExpression: keyExpr,
        listExpression: listExpr,
        heightData: heightData,
        widthData: widthData,
        scrollView: scrollCtrl.scrollView,
        transclude: transclude
      }));
      repeatManager.refreshLayout();
    }

    function parseDimensionAttr(attrValue, dimensionData) {
      if (!attrValue) return;

      dimensionData.attrValue = attrValue;
      var parsedValue = $parse(attrValue);

      // If it's a constant, it's either a percent or just some never-changing value.
      if (parsedValue.constant) {
        var intValue = parseInt(parsedValue());

        if (attrValue.indexOf('%') > -1) {
          var decimalValue = intValue / 100;
          dimensionData.getValue = dimensionData === heightData ?
            function() { return Math.floor(decimalValue * scrollView.__clientHeight); } :
            function() { return Math.floor(decimalValue * scrollView.__clientWidth); };
        } else {
          dimensionData.value = intValue;
        }

      } else {
        dimensionData.dynamic = true;
        dimensionData.getValue = dimensionData === heightData ?
          function heightGetter(scope, locals) {
            var result = parsedValue(scope, locals);
            if (result.charAt && result.charAt(result.length - 1) === '%')
              return Math.floor(parseInt(result) / 100 * scrollView.__clientHeight);
            return parseInt(result);
          } :
          function widthGetter(scope, locals) {
            var result = parsedValue(scope, locals);
            if (result.charAt && result.charAt(result.length - 1) === '%')
              return Math.floor(parseInt(result) / 100 * scrollView.clientWidth);
            return parseInt(result);
          };
      }
    }

    var computedStyleNode;
    var computedStyleScope;
    function computeStyleDimensions() {
      if (!computedStyleNode) {
        transclude(computedStyleScope = scope.$new(), function(clone) {
          clone[0].classList.add('collection-compute-element');
          computedStyleNode = clone[0];
        });
      }
      container[0].appendChild(computedStyleNode);

      var style = $window.getComputedStyle(computedStyleNode);
      computedStyleDimensions.width = parseInt(style.width);
      computedStyleDimensions.height = parseInt(style.height);

      container[0].removeChild(computedStyleNode);
    }

  }

}

RepeatManagerFactory.$inject = ['$rootScope', '$window'];
function RepeatManagerFactory($rootScope, $window) {
  var EMPTY_DIMENSION = { left: 0, top: 0, height: 0, width: 0 };

  return function RepeatController(options) {
    var containerNode = options.containerNode;

    var data = options.data;
    var scope = options.scope;
    var scrollView = options.scrollView;
    var transclude = options.transclude;
    var keyExpression = options.keyExpression;
    var listExpression = options.listExpression;
    var heightData = options.heightData;
    var widthData = options.widthData;

    var getterLocals = {};
    var heightFn = heightData.getValue || function() { return heightData.value; };
    var heightGetter = function(index, value) {
      getterLocals[keyExpression] = value;
      getterLocals.$index = index;
      return heightFn(scope, getterLocals);
    };

    var widthFn = widthData.getValue || function() { return widthData.value; };
    var widthGetter = function(index, value) {
      getterLocals[keyExpression] = value;
      getterLocals.$index = index;
      return widthFn(scope, getterLocals);
    };

    var isGridView = widthData.attrValue !== '100%';
    var isStaticView = !heightData.dynamic && !widthData.dynamic;

    var estimatedHeight;
    var estimatedWidth;

    var renderStartIndex = -1;
    var renderEndIndex = -1;
    var renderBottomBoundary = -1;
    var renderTopBoundary = -1;

    var itemsLeaving = [];
    var itemsShownMap = {};
    var estimatedRowLength;

    // TODO object pool should start at 2*(estimated items on screen)
    var itemsPool = [];
    for (i = 0; i < 60; i++) {
      itemsPool.push(new RepeatItem());
    }

    var totalPlacementTime = 0;
    var totalCalcTime = 0;
    var totalRenderTime = 0;
    var totalRenders = 0;
    var getNow = window.performance && window.performance.now ?
      function() { return window.performance.now(); } :
      function() { return +Date.now(); };
    function out(n) {
      return Math.round(n * 10000)/10000;
    }
    window.outputTimes = function() {
      return 'RENDER AVERAGES (ms)<br>- Node placement time: ' + out(totalPlacementTime / totalRenders) + '<br>- Dimension calculation time: ' + out(totalCalcTime / totalRenders) + '<br>- Total render time: ' + out(totalRenderTime / totalRenders);
    };

    // collectionView is a mix of list/grid methods + static/dynamic methods.
    // See bottom for implementations. Available methods:
    //
    // getEstimatedTop(i), getEstimatedLeft(i), getEstimatedIndex(scrollTop),
    // calculateDimensions(toIndex), getDimensions(index),
    // updateRenderRange(scrollTop, scrollBottom), onRefreshLayout(), onRefreshData()
    var collectionView = angular.extend(
      isGridView ? new GridViewType() : new ListViewType(),
      isStaticView ? new StaticViewType() : new DynamicViewType()
    );

    var isInitialized = false;
    this.refreshLayout = function() {
      isInitialized = true;

      estimatedHeight = heightGetter(0, data[0]);
      estimatedWidth = widthGetter(0, data[0]);
      estimatedRowLength = isGridView ?
        Math.max(1, Math.floor(scrollView.__clientWidth / estimatedWidth)) :
        1;

      (collectionView.onRefreshLayout || angular.noop)();
      render(true, renderStartIndex);
    };

    this.refreshData = function(newData) {
      data = newData;
      (collectionView.onRefreshData || angular.noop)();
      render(true, renderStartIndex);
    };

    this.refreshData(options.data);

    scope.$watchCollection(listExpression, angular.bind(this, function(value) {
      if (!angular.isArray(value || [])) {
        throw new Error("collection-repeat expected an array for '" + listExpression + "', " +
                        "but got a " + typeof value);
      }
      this.refreshData(value);
    }));

    scrollView.options.getContentHeight = angular.bind(collectionView, collectionView.getContentHeight);
    scrollView.__$callback = scrollView.__callback;
    scrollView.__callback = function(transformLeft, transformTop, zoom, wasResize) {
      var scrollTop = Math.max(0, Math.min(scrollView.__maxScrollTop, scrollView.__scrollTop));

      if (renderStartIndex === -1 ||
          scrollTop + scrollView.__clientHeight > renderBottomBoundary ||
          scrollTop < renderTopBoundary) {
        render();
      }
      scrollView.__$callback(transformLeft, transformTop, zoom, wasResize);
    };


    function render(forceRerender, forceStartIndex) {
      if (!isInitialized) return;
      var i;
      var item;
      var dim;
      var itemScope;
      var scrollTop = scrollView.__scrollTop;
      var scrollBottom = scrollTop + scrollView.__clientHeight;

      var startTime = getNow();

      collectionView.updateRenderRange(scrollTop, scrollBottom, forceStartIndex);

      var calcEndTime = getNow();
      totalCalcTime += (calcEndTime - startTime);
      var renderStartTime = getNow();

      for (i in itemsShownMap) {
        if (forceRerender || (i < renderStartIndex || i > renderEndIndex)) {
          item = itemsShownMap[i];
          delete itemsShownMap[i];
          itemsLeaving.push(item);
        }
      }

      // Render indicies that aren't shown yet
      for (i = renderStartIndex; i <= renderEndIndex; i++) {
        if (itemsShownMap[i]) continue;

        itemsShownMap[i] = item = getNextItem();
        itemScope = item.scope;
        dim = collectionView.getDimensions(i);

        itemScope.$index = i;
        itemScope[keyExpression] = data[i];
        itemScope.$first = (i === 0);
        itemScope.$last = (i === (data.length - 1));
        itemScope.$middle = !(itemScope.$first || itemScope.$last);
        itemScope.$odd = !(itemScope.$even = (i&1) === 0);

        //We changed the scope, so digest if needed
        if (itemScope.$$disconnected) ionic.Utils.reconnectScope(itemScope);
        if (!$rootScope.$$phase) itemScope.$digest();


        if (item.left !== dim.left || item.top !== dim.top) {
          item.node.style[ionic.CSS.TRANSFORM] = 'translate3d(' + dim.left + 'px,' +
            dim.top + 'px,0)';
          item.left = dim.left;
          item.top = dim.top;
        }
        if (item.width !== dim.width) {
          item.node.style.width = dim.width + 'px';
          item.width = dim.width;
        }
        if (item.height !== dim.height) {
          item.node.style.height = dim.height + 'px';
          item.height = dim.height;
        }

        // TODO make refresh images an attribute option
        for (var j = 0, jj = item.images.length, img; j < jj && (img = item.images[j]); j++) {
          var src = img.src;
          img.src = ONE_PX_TRANSPARENT_IMG_SRC;
          img.src = src;
        }
      }

      while (itemsLeaving.length) {
        item = itemsLeaving.pop();

        item.left = item.top = null;
        item.node.style[ionic.CSS.TRANSFORM] = 'translate3d(-9999px, -9999px, 0)';
        ionic.Utils.disconnectScope(item.scope);

        itemsPool.push(item);
      }
      var renderEndTime = getNow();
      totalPlacementTime += renderEndTime - renderStartTime;
      totalRenderTime += renderEndTime - startTime;
      totalRenders++;

      if (!render.reset) {
        totalCalcTime = totalPlacementTime = totalRenderTime = totalRenders = 0;
        render.reset = true;
      }
    }

    function getNextItem() {
      if (itemsLeaving.length)
        return itemsLeaving.pop();
      else if (itemsPool.length)
        return itemsPool.pop();
      return new RepeatItem();
    }

    function RepeatItem() {
      var self = this;
      this.scope = scope.$new();
      transclude(this.scope, function(clone) {
        self.element = clone;
        self.node = clone[0];
        self.node.style[ionic.CSS.TRANSFORM] = 'translate3d(-9999px,-9999px,0)';
        ionic.Utils.disconnectScope(self.scope);
        containerNode.appendChild(self.node);
        // TODO make refresh images an attribute option
        self.images = self.node.getElementsByTagName('img');
      });
    }

    function GridViewType() {
      this.getEstimatedLeft = function(index) {
        return (index % estimatedRowLength) * estimatedWidth;
      };
      this.getEstimatedTop = function(index) {
        return Math.floor(index / estimatedRowLength) * estimatedHeight;
      };
      this.getEstimatedIndex = function(scrollValue) {
        return Math.floor(scrollValue / estimatedHeight) * estimatedRowLength;
      };
    }

    function ListViewType() {
      this.getEstimatedLeft = function() {
        return 0;
      };
      this.getEstimatedTop = function(index) {
        return index * estimatedHeight;
      };
      this.getEstimatedIndex = function(scrollValue) {
        return Math.floor(scrollValue / estimatedHeight);
      };
    }

    function StaticViewType() {
      var dim = {};
      this.getContentHeight = function() {
        return this.getEstimatedTop(data.length - 1) + estimatedHeight;
      };
      // static view always returns the same object for getDimensions, to avoid memory allocation
      // while scrolling. This could be dangerous if this was a public function, but it's not.
      // Only we use it.
      this.getDimensions = function(index) {
        dim.top = this.getEstimatedTop(index);
        dim.left = this.getEstimatedLeft(index);
        dim.height = estimatedHeight;
        dim.width = estimatedWidth;
        return dim;
      };
      this.updateRenderRange = function(scrollTop, scrollBottom) {
        renderStartIndex = Math.max(0, this.getEstimatedIndex(scrollTop));

        // Make sure the renderEndIndex takes into account all the items on the row
        renderEndIndex = Math.min(data.length - 1,
          this.getEstimatedIndex(scrollBottom) + estimatedRowLength - 1);

        renderTopBoundary = this.getEstimatedTop(renderStartIndex);
        renderBottomBoundary = this.getEstimatedTop(renderEndIndex) + estimatedHeight;
      };
    }

    function DynamicViewType() {

      var scrollViewSetDimensions = function() {
        scrollView.setDimensions(null, null, null, scrollView.options.getContentHeight(), true);
      };
      var debouncedScrollViewSetDimensions = ionic.debounce(scrollViewSetDimensions, 25, true);
      var calculateDimensions = isGridView ? calculateDimensionsGrid : calculateDimensionsList;
      var dimensionsIndex;
      var dimensions = [];

      // Get the dimensions at index. {width, height, left, top}.
      // We start with no dimensions calculated, then any time dimensions are asked for at an
      // index we calculate dimensions up to there.
      function calculateDimensionsList(toIndex) {
        var i, prevDimension, dim;
        for (i = Math.max(0, dimensionsIndex); i <= toIndex && (dim = dimensions[i]); i++) {
          prevDimension = dimensions[i - 1] || EMPTY_DIMENSION;
          dim.height = heightGetter(i, data[i]);
          dim.width = scrollView.__clientWidth;
          dim.top = prevDimension.top + prevDimension.height;
          dim.left = 0;
        }
      }
      function calculateDimensionsGrid(toIndex) {
        var i, prevDimension, dim;
        for (i = Math.max(dimensionsIndex, 0); i <= toIndex && (dim = dimensions[i]); i++) {
          prevDimension = dimensions[i - 1] || EMPTY_DIMENSION;
          dim.width = Math.min(widthGetter(i, data[i]), scrollView.__clientWidth);
          dim.left = prevDimension.left + prevDimension.width;

          if (i === 0 || dim.left + dim.width > scrollView.__clientWidth) {
            dim.rowStartIndex = i;
            dim.left = 0;
            dim.height = heightGetter(i, data[i]);
            dim.top = prevDimension.top + prevDimension.height;
          } else {
            dim.rowStartIndex = prevDimension.rowStartIndex;
            dim.height = prevDimension.height;
            dim.top = prevDimension.top;
          }
        }
      }

      this.getContentHeight = function() {
        var dim = dimensions[dimensionsIndex] || EMPTY_DIMENSION;
        return ((dim.top + dim.height) || 0) +
          this.getEstimatedTop(data.length - dimensionsIndex - 1);
      };
      this.onRefreshData = function() {
        // Make sure dimensions has as many items as data.length.
        // This is to be sure we don't have to allocate objects while scrolling.
        for (i = dimensions.length, len = data.length; i < len; i++) {
          dimensions.push({});
        }
      };
      this.onRefreshLayout = function() {
        dimensionsIndex = -1;
      };
      this.getDimensions = function(index) {
        index = Math.min(index, data.length - 1);

        if (dimensionsIndex < index) {
          // Once we start asking for dimensions near the end of the list, go ahead and calculate
          // everything. This is to make sure when the user gets to the end of the list, the
          // scroll height of the list is 100% accurate (not estimated anymore).
          if (index > data.length * 0.9) {
            calculateDimensions(data.length - 1);
            dimensionsIndex = data.length - 1;
            scrollViewSetDimensions();
          } else {
            calculateDimensions(index);
            dimensionsIndex = index;
            debouncedScrollViewSetDimensions();
          }

        }
        return dimensions[index];
      };

      var oldRenderStartIndex = -1;
      var oldScrollTop = -1;
      this.updateRenderRange = function(scrollTop, scrollBottom) {
        var i;
        var len;
        var dim;

        // Calculate more dimensions than we estimate we'll need, to be sure.
        this.getDimensions( this.getEstimatedIndex(scrollBottom) * 2 );

        // base case: start at 0
        if (oldRenderStartIndex === -1 || scrollTop === 0) {
          i = 0;
        // scrolling down
        } else if (scrollTop >= oldScrollTop) {
          for (i = oldRenderStartIndex, len = data.length; i < len; i++) {
            if ((dim = this.getDimensions(i)) && dim.top + dim.height >= scrollTop) break;
          }
        // scrolling up
        } else {
          for (i = oldRenderStartIndex; i >= 0; i--) {
            if ((dim = this.getDimensions(i)) && dim.top <= scrollTop) {
              // when grid view, make sure the render starts at the beginning of a row.
              i = isGridView ? dim.rowStartIndex : i;
              break;
            }
          }
        }

        renderStartIndex = Math.min(Math.max(0, i), data.length - 1);
        renderTopBoundary = this.getDimensions(renderStartIndex).top;

        var lastRowDim;
        for (i = renderStartIndex + 1, len = data.length; i < len; i++) {
          if ((dim = this.getDimensions(i)) && dim.top + dim.height > scrollBottom) {
            // Take the endIndex to the end of the row if we're in a grid
            if (isGridView) {
              lastRowDim = dim;
              while (i < len && (dim = this.getDimensions(i + 1)).top === lastRowDim.top) {
                i++;
              }
            }
            break;
          }
        }

        renderEndIndex = Math.min(i, data.length - 1);
        renderBottomBoundary = (dim = this.getDimensions(renderEndIndex)).top + dim.height;

        oldScrollTop = scrollTop;
        oldRenderStartIndex = renderStartIndex;
      };

    }


  };

}

})();
