正如我们上一节所看到的的那样，$digest工作方式是从当前scope向下遍历。这不是$apply的工作方式。当在Angular中调用$apply的时候，它应该从RootScope上开始遍历整个scope层级结构。但是目前的实现并没有这样做。看下面的测试已经说明了。

```js
it('digests from root on $apply', function() {
    var parent = new Scope();
    var child = parent.$new();
    var child2 = child.$new();
    parent.aValue = 'abc';
    parent.counter = 0;
    parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.counter++;
        }
    );
    child2.$apply(function(scope) { });
    expect(parent.counter).toBe(1);
});
```

当我们在子scope上调用$apply时，它并不会触发祖先scope上的watch。为了使它工作，首先需要为所有的scope添加一个rootScope的引用以便他们可以触发digest。虽然我们可以通过原型链找到rootScope，但是直接暴露一个$root变量更方便。我们在rootScope的构造函数中设置一个$root.

```
function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$applyAsyncQueue = [];
	this.$$applyAsyncId = null;
	this.$$postDigestQueue = [];
	this.$root = this;
	this.$$children = [];
	this.$$phase = null;
}
```

这个单独的变量$root可以用于层级结构中的所有scope，这要感谢原型继承链。我们要确保$apply是从rootScope上调用$digest，而不是当前scope上调用$digest。

```
Scope.prototype.$apply = function(expr) {
	try{
		this.$beginPhase('$apply');
		return this.$eval(expr);
	} finally {
		this.$clearPhase();
		this.$root.$digest();
	}
};
```

注意，因为我们调用的是`this`上的`$eval`，我们仍然是在当前scope上计算给定函数而不是在rootScope上。我们只是想让$digest从rootScope上开始向下运行。

事实上$apply从rootScope上开始$digest的原因之一是它是在Angular $digest 循环中集成外部代码的首选方法。如果你不能准确的知道你在哪些scope上做出了改变，最安全的方式是从rootScope上开始执行所有的$digest。

值得注意的是，由于Angular只有一个$rootScope,$apply会引起每个scope上的每个watch都被执行。掌握关于$apply和$digest的区别的知识，当你需要性能优化的时候，有时可以用$digest来代替$apply。

通过上面修改, 已经覆盖了 $digest 和 $apply 方法, 还有 $applyAsync 和 $evalAsync 方法需要修改, 先看一个测试:

```
it('schedules a digest from root on $evalAsync', function(done) {
    var parent = new Scope();
    var child = parent.$new();
    var child2 = child.$new();
    parent.aValue = 'abc';
    parent.counter = 0;
    parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.counter++;
        }
    );
    child2.$evalAsync(function(scope) { });
    setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
    }, 50);
});
```

这个测试类似于前一个，我们检查在scope上调用$evalAsync是否会引起rootScope上的watch执行。

因为每个scope已经有了rootScope的引用，所以对$evalAsync的修改非常简单。

```
Scope.prototype.$evalAsync = function(expr) {
	var self = this;
	// 如果是当前scope上的phase不存在或者$$asyncQueue异步队列中已经没有值了,是空的
	if (!self.$$phase && !self.$$asyncQueue.length) {
		setTimeout(function() {
			if (self.$$asyncQueue.length) {
				self.$root.$digest();
			}
		}, 0);
	}
	self.$$asyncQueue.push({scope: self, expression: expr});
};
```

掌握了$root属性，我们现在可以重新访问我们的$digest代码，确保我们总是引用正确的$$lastDirtyWatch来检查缩短回路优化。我们应该引用$root的$$lastDirtyWatch而不管是哪个scope的$digest被调用。

我们应该在$watch中引用$root.$$lastDirtyWatch.

```

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
	var self = this;
	var watcher = {
		watchFn: watchFn,
		listenerFn: listenerFn || function() {},
		valueEq: !!valueEq,
		last: initWatchVal
	};
	self.$$watchers.unshift(watcher);
	this.$root.$$lastDirtyWatch = null;

	return function() {
		var index = self.$$watchers.indexOf(watcher);
		if (index >= 0) {
			self.$$watchers.splice(index, 1);
			self.$root.$$lastDirtyWatch = null;
		}
	};
};

```

我们也应该在$digest中这样做。

```
Scope.prototype.$digest = function() {
	// time to live
	var ttl = 10;
	var dirty;
	this.$root.$$lastDirtyWatch = null;
	this.$beginPhase('$digest');

	if (this.$$applyAsyncId) {
		clearTimeout(this.$$applyAsyncId);
		this.$$flushApplyAsync();
	}
	do {
		while (this.$$asyncQueue.length) {
			try {
				var asyncTask = this.$$asyncQueue.shift();
				asyncTask.scope.$eval(asyncTask.expression);
			} catch (e) {
				console.error(e);
			}
		}
		dirty = this.$$digestOnce();
		// 如果是脏值或者$$asyncQueue中还有值
		if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
			this.$clearPhase();
			throw '10 digest iterations reached';
		}
	} while (dirty || this.$$asyncQueue.length);
	this.$clearPhase();

	while (this.$$postDigestQueue.length) {
		try {
			this.$$postDigestQueue.shift()();
		} catch (e) {
			console.error(e);
		}
	}
};

```

最后，在$$digestOnce中也应该这么做。

