上一节讨论了调用$digest不应该在父层级上执行watches，而应该执行子层级的watches，在我们调用的子scope上。这是有道理的，因为一些子层级上的watches可以通过原型链监听我们的属性。

因为每个scope都有了自己的watcher数组，当我们在父scope上调用$digest时，子scope不会再次调用$digest，我们需要修复$digest的这个缺点，让它不仅在自己的scope上调用，也在子scope上调用$digest.

第一个问题是scope不知道当前自己有没有子scope或者哪些子scope是属于自己的。我们需要在rootScope和子scope上记录它的子scope。让我们把scope保存在一个叫做`$$children`的属性中。

```
it('keeps a record of its children', function() {
    var parent = new Scope();
    var child1 = parent.$new();
    var child2 = parent.$new();
    var child2_1 = child2.$new();
    expect(parent.$$children.length).toBe(2);
    expect(parent.$$children[0]).toBe(child1);
    expect(parent.$$children[1]).toBe(child2);
    expect(child1.$$children.length).toBe(0);
    expect(child2.$$children.length).toBe(1);
    expect(child2.$$children[0]).toBe(child2_1);
});
```

我们需要在rootScope中初始化`$$children`数组。

```
function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$applyAsyncQueue = [];
	this.$$applyAsyncId = null;
	this.$$postDigestQueue = [];
	this.$$children = [];
	this.$$phase = null;
}
```

然后需要在新创建的Scope添加一个$$children数组，同时需要把他们的子scope放入$$children中。这样就不会在$$watchers中遇到同样的问题。这两个变化都在$new方法里面。

```
Scope.prototype.$new = function() {
	var ChildScope = function() { };
	ChildScope.prototype = this;
	var child = new ChildScope();
	this.$$children.push(child);
	child.$$watchers = [];
	child.$$children = [];
	return child;
};
```

现在我们可以记录子scope了，可以讨论一下如何$digest他们。我们想要在父scope上运行$digest的时候，也执行子scope上的注册的watch。

```
it('digests its children', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.aValue = 'abc';
    child.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.aValueWas = newValue;
        }
    );
    parent.$digest();
    expect(child.aValueWas).toBe('abc');
});
```

注意这个测试基本上是最后一节中我们断言的测试的镜像。对子scope调用$digest不应该运行父scope的watches。

为此，我们需要修改$$digestOnce,在整个层级结构中运行watches，为了使这更容易，我们添加一个帮助函数`$$everyScope`（以JavaScript的Array.every命名），为层级结构中的每个scope执行一个任意函数，直到函数返回false。

```
Scope.prototype.$$everyScope = function(fn) {
    if (fn(this)) {
        return this.$$children.every(function(child) {
            return child.$$everyScope(fn);
        });
    } else {
        return false;
    }
};
```

该函数为当前scope调用一次fn，并且给每个子scope递归的调用自己。我们现在可以在$$digestOnce中使用这个函数来形成整个操作的外层循环：

```
Scope.prototype.$$digestOnce = function() {
	var dirty;
	var continueLoop = true;
	var self = this;
	this.$$everyScope(function(scope) {
		var newValue, oldValue;
		_.forEachRight(scope.$$watchers, function(watcher) {
			try {
				if (watcher) {
					newValue = watcher.watchFn(scope);
					oldValue = watcher.last;
					if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
						self.$$lastDirtyWatch = watcher;
						watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
						watcher.listenerFn(newValue,
							(oldValue === initWatchVal ? newValue : oldValue),
							scope);
						dirty = true;
					} else if (self.$$lastDirtyWatch === watcher) {
						continueLoop = false;
						return false;
					}
				}
			} catch (e) {
				console.error(e);
			}
		});
		return continueLoop;
	});
	return dirty;
};
```

$$digestOnce函数现在在整个层级结构中运行，并返回一个表示层级结构中任何位置的任何watch是否是脏值的布尔值。内循环遍历scope的层级结构，直到访问到所有的scope或者直到短路优化开始。使用`continueLoop `变量来追踪优化，如果它变为假，则跳出循环和$$digestOnce函数。

注意，我们使用一个特定的scope变量来替换内层循环中的this。watch函数必须传递给他们最初附加的scope对象。

还要注意，我们使用的$$lastDirtyWatch属性总是最顶层的scope的属性。缩短回路优化需要考虑scope层级结构中所有的watches，如果我们只在当前scope设置$$lastDirtyWatch，则会隔离父scope的属性。

