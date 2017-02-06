在实现`$evalAsync`,`applyAsync`和`$$postDigest`的过程中有一个问题是，当某处有异常时，会放弃并停止digest循环。然而，实际上Angular的实现会更健壮，它会在一个$digest运行前，期间，之后捕捉并抛出异常。
对于`$evalAsync`，我们可以定义一个测试用例（在`describe('$evalAsync')`里），它可以检查一个$watch是否会在$evalAsync函数抛出异常时继续运行。

```
it('catchs exceptions in $evalAsync', function(done) {
    scope.aValue = 'abc';
    scope.counter = 0;

    scope.$watch(function(scope) {
        return scope.aValue;
    }, function(newValue, oldValue, scope) {
        scope.counter++;
    });

    scope.$evalAsync(function(scope) {
        throw 'Error';
    });

    setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
    }, 50);
});
```

对于`$applyAsync`，我们定义一个测试用例用来检查一个被`$applyAsync`安排的函数会被调用，即使在这个函数之前有异常抛出。这里在`describe('$applyAsync')`测试块中。
```
it('catches exceptions in $applyAsync', function(done) {
    scope.$applyAsync(function(scope) {
        throw 'Error';
    });
    scope.$applyAsync(function(scope) {
        throw 'Error';
    });
    scope.$applyAsync(function(scope) {
        scope.applied = true;
    });

    setTimeout(function() {
        expect(scope.applied).toBe(true);
        done();
    }, 50);
});
```

---
我们使用了两个error函数，因为如果只用一个的话，第二个函数的确会执行。这是因为$apply启动了$digest,并且$applyAsync队列在finally块中被清空了。
---

对于`$$postDigest`,`$digest`已经结束了，所以用$watch测试没有意义。我们可以用第二个`$$postDigest`来代替测试，确保它依然会执行。这个测试添加到`describe('$$postDigest')`中。
```
it('catches exceptions in $$postDigest', function() {
    var didRun = false;
    scope.$$postDigest(function() {
        throw 'Error';
    });

    scope.$$postDigest(function() {
        didRun = true;
    });

    scope.$digest();
    expect(didRun).toBe(true);
});
```

修复`$evalAsync`和`$$postDigest`涉及到修改`$digest`函数，在这两个例子中我们把函数包裹在`try...catch`中。
```
Scope.prototype.$digest = function() {
	// time to live
	var ttl = 10;
	var dirty;
	this.$$lastDirtyWatch = null;
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

修复`$applyAsync`,另一方面，在循环完成后清空`$$flushApplyAsync`队列。
```
Scope.prototype.$$flushApplyAsync = function() {
	while (this.$$applyAsyncQueue.length) {
		// 执行applyAsyncQueue队列中的第一个函数并在数组里删除它
		try {
			this.$$applyAsyncQueue.shift()();
		} catch (e) {
			console.error(e);
		}
	}
	this.$$applyAsyncId = null;
};
```
现在在我们的$digest周期中在处理异常时更强大了。