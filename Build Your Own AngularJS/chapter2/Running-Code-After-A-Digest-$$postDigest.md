还有一种方法，可以运行一些和`$digest`相关联的代码，通过调度`$$postDigest`,在Angular中双美元符号$$是私有变量，而不是开发人员用的东西，但这里我们依然会实现它。
就像`$evalAsync`和`$applyAsync`一样，`$$postDigest`也是在调度一个函数后`later`。
具体来说，该函数在下一个$digest脏检查完成之后运行，与`$evalAsync`似类的是，`$$postDigest`只会执行一次，与`$evalAsync`和`applyAsync`不同的是，调度`$$postDigest`不会发起一个$digest,所以函数会被延迟执行直到由其他原因发起一个`$digest`脏检查。
```
describe('$postDigest', function() {
    var scope;
    beforeEach(function() {
        scope = new Scope();
    });
    it('runs after each digest', function() {
        scope.counter = 0;
        scope.$$postDigest(function() {
            scope.counter++;
        });
        expect(scope.counter).toBe(0);
        scope.$digest();
        expect(scope.counter).toBe(1);
        scope.$digest();
        expect(scope.counter).toBe(1);
    });
});
```

顾名思义，`$$postDigest`函数在$digest之后运行，所以在`$$postDigest`内部对Scope做一些改变，它不会被立即进行脏检查，如果这是你想要的话，需要手动调用`$apply`或者`$digest`
```
it('does not include $$postDigest in the digest', function() {
    scope.aValue = 'original value';
    scope.$$postDigest(function() {
        scope.aValue = 'changed value';
    });
    scope.$watch(
        function(scope) {
            return scope.aValue;
        },
        function(newValue, oldValue, scope) {
            scope.watchedValue = newValue;
        }
    );
    scope.$digest();
    expect(scope.watchedValue).toBe('original value');
    scope.$digest();
    expect(scope.watchedValue).toBe('changed value');
});
```
要实现`$$postDigest`，首先在Scope构造函数中初始化一个数组:
```
function Scope() {
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null;
    this.$$postDigestQueue = [];
    this.$$phase = null;
}
```
接下来，实现`$$postDigest`，它所做的就是将给定的函数添加到队列里。
```
Scope.prototype.$$postDigest = function(fn) {
	this.$$postDigestQueue.push(fn);
};
```

最后，在`$digest`中，排队并且在`$digest`完成后调用队列里的那些函数。
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
			var asyncTask = this.$$asyncQueue.shift();
			asyncTask.scope.$eval(asyncTask.expression);
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
		this.$$postDigestQueue.shift()();
	}
};
```
我们通过使用`Array.shift()`从队列中删除并调用这些函数直到数组为空，`$$postDigest`没有给任何参数。