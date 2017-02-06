到目前为止，我们已经看着watches和listeners作为简单的因果效应对。当它改变时，就照做。然而，这是不寻常的，想要监听几个状态并且当其中任何一个发生改变时执行一些代码。

因为Angular watches只是正常的js函数。我们目前已有的watch是完全可以实现的。只是一个watch函数运行多个检查并且返回它们的一些组合值，导致listener触发。

从Angular1.3之后，不必在手动的创建这种类型的函数了。相反，可以使用一个叫做`$watchGroup`的内置的Scope功能。

`$watchGroup`函数把几个watch函数包裹在一个数组中，并且只有一个listener函数。这个想法是，当数组中的任意一个watch函数检测到改变时，调用listener函数。listener函数给出的新值和旧值是按照原有的watch函数的顺序包含在一个数组里。

这是第一个测试用例，在一个新的describe块中。
```
describe('$watchGroup', function() {
    var scope;

    beforeEach(function() {
        scope = new Scope();
    });

    it('takes watches as an array and calls listener with arrays', function() {
        var gotNewValues, gotOldValues;
        scope.aValue = 1;
        scope.anotherValue = 2;
        scope.$watchGroup([
            function(scope) {
                return scope.aValue;
            }, function(scope) {
                return scope.anotherValue;
            }
        ], function(newValues, oldValues, scope) {
            gotNewValues = newValues;
            gotOldValues = oldValues;
        });

        scope.$digest();
        expect(gotNewValues).toEqual([1, 2]);
        expect(gotOldValues).toEqual([1, 2]);

    });
});
```
在测试中，我们获取了listener的newValues和oldValues参数，并且检查了他们是包含了watch函数的返回值的数组。

让我们第一次试着实现$watchGroup,我们可以尝试单独注册每个watch，重用每个watch的listener。
```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
	var self = this;
	_.forEach(watchFns, function(watchFn) {
		self.$watch(watchFn, listenerFn);
	});
};
```

这不是真的消减（cut）了，我们期望listener函数接收所有的watch值的数组。但是现在它只是单独的调用每个watch的值。

我们需要给每个watch定义单独的内部listener函数，并且在这些单独的listener函数内部，将值收集到数组中。我们可以把这些数组赋给原来的listener函数。我们将使用一个数组作为newValues，另一个数组作为oldValues。
```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
	var self = this;
	var newValues = new Array(watchFns.length);
	var oldValues = new Array(watchFns.length);
	_.forEach(watchFns, function(watchFn, i) {
		self.$watch(watchFn, function(newValue, oldValue) {
			newValues[i] = newValue;
			oldValues[i] = oldValue;
			listenerFn(newValues, oldValues, self);
		});
	});
};
```
---
$watchGroup总是使用参考watch来检测变化。
---

我们第一个实现有点儿问题，他调用listener太热切了，如果在watch数组中有几次改变，listener将被调用几次。我们想要的是它只被调用一次。更糟糕的是，因为我们在调用listener之后通知一个变化，有可能我们有一个新值和以前的值的混合混合值在我们的oldValues和newValues数组中，导致用户看到不一致的值组合。

让我们测试一下，即使存在多个改变，listener也只调用一次。
```
it('only calls listener once per digest', function() {
    scope.counter = 0;
    scope.aValue = 1;
    scope.anotherValue = 2;
    scope.$watchGroup([
        function(scope) {
            return scope.aValue;
        }, function(scope) {
            return scope.anotherValue;
        }
    ], function(newValues, oldValues, scope) {
        scope.counter++;
    });

    scope.$digest();

    expect(scope.counter).toBe(1);
});
```
我们应该怎样推迟调用listener，直到所有的watch都被检查过了。因为我们的`$watchGroup`不负责运行一个$digest,没有一个地方供我们来调用listener。但是我们可以使用$evalAsync这个我们在上一章实现过的函数。它的目的是稍晚一些做点儿事情，但仍在同一个$digest里面，这正合我意!

我们在$watchGroup里创建一个新的内部函数叫watchGroupListener.这个函数负责调用两个数组的原始listener。然后，在每个独立的listener中，调度该函数，除非已经有一个watchGroupListener被调度。
```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
	var self = this;
	var newValues = new Array(watchFns.length);
	var oldValues = new Array(watchFns.length);
	var changeReactionScheduled = false;

	function watchGroupListener() {
		listenerFn(newValues, oldValues, self);
		changeReactionScheduled = false;
	}
	_.forEach(watchFns, function(watchFn, i) {
		self.$watch(watchFn, function(newValue, oldValue) {
			newValues[i] = newValue;
			oldValues[i] = oldValue;
			if (!changeReactionScheduled) {
				changeReactionScheduled = true;
				self.$evalAsync(watchGroupListener);
			}
		});
	});
};
```

这需要关心`$watchGroup`的基本行为，我们把注意力转移到一对特殊的案例中。

一个问题是关于当第一次调用listener时，要求新值和旧值应该是相同的，现在我们的`$watchGroup`已经做了这样的事情，
因为他是建立在这种行为上实现的$watch函数。在第一次调用时，newValues和oldValues数组的内容将完全相同。

然而，虽然这两个数组的内容是相同的，但他们目前仍然是两个独立的数组对象。这将打破使用相同的两次值得合同。这也意味着如果一个用户想要比较在这两个值，他们不能使用引用相等(===)，而必须去迭代数组的内容去看他们是否匹配。

我们想要做的更好，并且在第一次调用时使用的新值和旧值都是相同的确切值。
```
it('uses the same array of old and new values on frst run', function() {
    var gotNewValues, gotOldValues;
    scope.aValue = 1;
    scope.anotherValue = 2;
    scope.$watchGroup([
        function(scope) { return scope.aValue; },
        function(scope) { return scope.anotherValue; }
    ], function(newValues, oldValues, scope) {
        gotNewValues = newValues;
        gotOldValues = oldValues;
    });
    scope.$digest();
    expect(gotNewValues).toBe(gotOldValues);
});
```

在这样做的时候，我们还要确保不会破坏我们已有的测试，确保我们仍然在后续的listener调用中获取不同的数组。
```
it('uses different arrays for old and new values on subsequent runs', function() {
    var gotNewValues, gotOldValues;
    scope.aValue = 1;
    scope.anotherValue = 2;

    scope.$watchGroup([
        function(scope) {
            return scope.aValue;
        }, function(scope) {
            return scope.anotherValue;
        }
    ], function(newValues, oldValues, scope) {
        gotNewValues = newValues;
        gotOldValues = oldValues;
    });

    scope.$digest();

    scope.anotherValue = 3;
    scope.$digest();
    expect(gotNewValues).toEqual([1, 3]);
    expect(gotOldValues).toEqual([1, 2]);
});
```

我们可以通过在watchGroup的listener中检查它是否第一次被调用来实现这个需求，如果是，我们将把原来的newValues数组传递给原始的listener两次。
```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
    var self = this;
    var newValues = new Array(watchFns.length);
    var oldValues = new Array(watchFns.length);
    var changeReactionScheduled = false;
    var firstRun = true;

    function watchGroupListener() {
        if (firstRun) {
            firstRun = false;
            listenerFn(newValues, newValues, self);
        } else {
            listenerFn(newValues, oldValues, self);
        }
        changeReactionScheduled = false;
    }
    _.forEach(watchFns, function(watchFn, i) {
        self.$watch(watchFn, function(newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;
            if (!changeReactionScheduled) {
                changeReactionScheduled = true;
                self.$evalAsync(watchGroupListener);
            }
        });
    });
};
```
另一种特殊的情况是watch数组恰好为空时。目前的实现显然什么都没做，如果没有watchers，没有listerner会被发起，Angular实际上做的是会确保listener会调用一次，用空数组作为值。

```
it('calls the listener once when the watch array is empty', function() {
    var gotNewValues, gotOldValues;

    scope.$watchGroup([], function(newValues, oldValues, scope) {
        gotNewValues = newValues;
        gotOldValues = oldValues;
    });

    scope.$digest();
    expect(gotNewValues).toEqual([]);
    expect(gotOldValues).toEqual([]);
});
```

我们要做的是在`$watchGroup`检查空数组的案例，调用一下listener，然后返回而不必做任何进一步的设置。

```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
    var self = this;
    var newValues = new Array(watchFns.length);
    var oldValues = new Array(watchFns.length);
    var changeReactionScheduled = false;
    var firstRun = true;

    if (watchFns.length === 0) {
        self.$evalAsync(function() {
            listenerFn(newValues, oldValues, self);
        });
        return;
    }

    function watchGroupListener() {
        if (firstRun) {
            firstRun = false;
            listenerFn(newValues, newValues, self);
        } else {
            listenerFn(newValues, oldValues, self);
        }
        changeReactionScheduled = false;
    }
    _.forEach(watchFns, function(watchFn, i) {
        self.$watch(watchFn, function(newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;
            if (!changeReactionScheduled) {
                changeReactionScheduled = true;
                self.$evalAsync(watchGroupListener);
            }
        });
    });
};
```

我们需要为`$watchGroup`做的最后一个功能是注销。一个可以注销的watch组应该与注销单个watch的方式完全相同，通过`$watchGroup`返回一个remove函数。

```
it('can be deregistered', function() {
    var counter = 0;
    scope.aValue = 1;
    scope.anotherValue = 2;
    var destroyGroup = scope.$watchGroup([function(scope) {
        return scope.aValue;
    }, function(scope) {
        return scope.anotherValue;
    }], function(newValues, oldValues, scope) {
        counter++;
    });

    scope.$digest();
    scope.anotherValue = 3;
    destroyGroup();
    scope.$digest();
    expect(counter).toBe(1);
});
```

这里我们测试了一旦销毁函数被调用，进一步的改变不会引起listener函数调用。因为各个注册的watch已经返回了remove（移除）函数，我们真正需要做的是收集他们，然后创建一个销毁函数来调用他们。

```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
    var self = this;
    var newValues = new Array(watchFns.length);
    var oldValues = new Array(watchFns.length);
    var changeReactionScheduled = false;
    var firstRun = true;

    if (watchFns.length === 0) {
        self.$evalAsync(function() {
            listenerFn(newValues, oldValues, self);
        });
        return;
    }

    function watchGroupListener() {
        if (firstRun) {
            firstRun = false;
            listenerFn(newValues, newValues, self);
        } else {
            listenerFn(newValues, oldValues, self);
        }
        changeReactionScheduled = false;
    }
    // _.forEach(watchFns, function(watchFn, i) {
    var destroyFunctions = _.map(watchFns, function(watchFn, i) {   
        return self.$watch(watchFn, function(newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;
            if (!changeReactionScheduled) {
                changeReactionScheduled = true;
                self.$evalAsync(watchGroupListener);
            }
        });
    });

    return function() {
        _.forEach(destroyFunctions, function(destroyFunction) {
            destroyFunction();
        });
    };
};
```

有一种情况是watch的数组是空的，他需要删除自己的watch函数。在这种情况下listener只能调用一次，但是甚至在第一次$digest发生之前，销毁函数仍然可以被调用。在这种情况下，即使是单个的调用也应该被跳过。

```
it('does not call the zero-watch listener when deregistered frst', function() {
    var counter = 0;

    var destroyGroup = scope.$watchGroup([], function(newValues, oldValues, scope) {
        counter++;
    });

    destroyGroup();
    scope.$digest();
    expect(counter).toEqual(0);
});
```

这种情况下的销毁函数只是设置了一个布尔值，在调用之前检查listener函数。

```
Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
    var self = this;
    var newValues = new Array(watchFns.length);
    var oldValues = new Array(watchFns.length);
    var changeReactionScheduled = false;
    var firstRun = true;

    if (watchFns.length === 0) {
        var shouldCall = true;
        self.$evalAsync(function() {
            if (shouldCall) {
                listenerFn(newValues, oldValues, self);
            }
        });
        return function() {
            shouldCall = false;
        };
    }

    function watchGroupListener() {
        if (firstRun) {
            firstRun = false;
            listenerFn(newValues, newValues, self);
        } else {
            listenerFn(newValues, oldValues, self);
        }
        changeReactionScheduled = false;
    }
    // _.forEach(watchFns, function(watchFn, i) {
    var destroyFunctions = _.map(watchFns, function(watchFn, i) {   
        return self.$watch(watchFn, function(newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;
            if (!changeReactionScheduled) {
                changeReactionScheduled = true;
                self.$evalAsync(watchGroupListener);
            }
        });
    });

    return function() {
        _.forEach(destroyFunctions, function(destroyFunction) {
            destroyFunction();
        });
    };
};
```

