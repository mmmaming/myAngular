虽然`$evalAsync`可以被用于在一个$digest内部或者外部发起一个延迟工作，通过调用setTimeout发起一个$digest大多数情况下是为了防止有人从$digest外部调用$evalAsync而产生混淆。

对于从外部的$digest异步循环使用$apply的情况，有一个专门的叫做`$applyAsync`的函数，它被设计的像$apply一样，但跟$apply不一样的是，它不会立即计算一个给定的函数，也不立即发起一个$digest脏检查,而是在一个很短的时间后再调度这两件事情。

将$applyAsync添加到框架中的最初动机是为了处理HTTP响应，每当$http服务收到一个响应，调用任何响应处理程序，一个$digest发生。这意味着每个HTTP响应都会发起一个$digest脏检查。如果有多个HTTP响应，就可能引起性能问题。现在$http服务可以使用$applyAsync代替，这种情况下，非常接近的HTTP响应会被合并到一个$digest循环里面。然而$applyAsync并没有绑定到$http服务中，你可以在任何地方享受这个功能。

在第一个测试中，当我们使用$applyAsync时，它不会立即引起一些事情的发生，而是在50毫秒后才发生。
```
describe('$applyAsync', function() {
    var scope;
    beforeEach(function() {
        scope = new Scope();
    });
    it('allows async $apply with $applyAsync', function(done) {
        scope.counter = 0;
        scope.$watch(
            function(scope) { return scope.aValue; },
            function(newValue, oldValue, scope) {
                scope.counter++;
            }
        );
        scope.$digest();
        expect(scope.counter).toBe(1);
        scope.$applyAsync(function(scope) {
            scope.aValue = 'abc';
        });
        expect(scope.counter).toBe(1);
        setTimeout(function() {
            expect(scope.counter).toBe(2);
            done();
        }, 50);
    });
});
```
到目前为止，这和`$evalAsync`并没有什么不同，但是当我们从`listener`函数中调用`$applyAsync`时，就会看到不同的地方了，如果使用`$evalAsync`，函数会在同一个`$digest`中被调用，但是`$applyAsync`会延迟调用。
```
it('never executes $applyAsynced function in the same cycle', function(done) {
scope.aValue = [1, 2, 3];
scope.asyncApplied = false;
scope.$watch(
function(scope) { return scope.aValue; },
function(newValue, oldValue, scope) {
scope.$applyAsync(function(scope) {
scope.asyncApplied = true;
});
}
);
scope.$digest();
expect(scope.asyncApplied).toBe(false);
setTimeout(function() {
expect(scope.asyncApplied).toBe(true);
done();
}, 50);
});
```
让我们在Scope的contructor中加入另一个队列来实现`$applyAsync`.
```
function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$applyAsyncQueue = [];
	this.$$phase = null;
}
```
当`$applyAsync`被调用 的时候，给队列里push一个函数，这个函数稍后会计算给定函数在Scope的上下文中，就像`$apply`那样。
```
Scope.prototype.$applyAsync = function(expr) {
    var self = this;
    self.$$applyAsyncQueue.push(function() {
        self.$eval(expr);
    });
};
```

我们还要做的是实际调度函数应用程序，我们在这里用setTimeout并且delay等于0，在timeout之后，我们的$apply函数会调用队列里的所有函数并最后清空队列。
```
Scope.prototype.$applyAsync = function(expr) {
	var self = this;
	self.$$applyAsyncQueue.push(function() {
		self.$eval(expr);
	});
	setTimeout(function() {
		self.$apply(function() {
			while (self.$$applyAsyncQueue.length) {
				self.$$applyAsyncQueue.shift()();
			}
		});
	}, 0);
};
```

---
注意，我们没有给队列中每个单独的item都$apply,我们只在外部循环$apply了一次。
---
正如我们讨论的那样，$applyAsync的要点是优化快速连续发生的事情，所以只需要一个$digest脏检查。
```
it('coalesces many calls to $applyAsync', function(done) {
    scope.counter = 0;
    scope.$watch(
        function(scope) {
            scope.counter++;
            return scope.aValue;
        },
        function(newValue, oldValue, scope) { }
    );
    scope.$applyAsync(function(scope) {
        scope.aValue = 'abc';
    });
    scope.$applyAsync(function(scope) {
        scope.aValue = 'def';
    });
    setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
    }, 50);
});
```
我们想要counter变成2，而不是更多。我们要做的是保持追踪一个setTimeout是否排在队列里并且已经被调度，我们将这个信息保存在一个叫做$$applyAsyncId的Scope的私有属性中。
```
function Scope() {
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null;
    this.$$phase = null;
}

```
然后我们可以在调度作业中检查这个属性，并且保持它的状态当作业已经被调度并且完成。
```
Scope.prototype.$applyAsync = function(expr) {
    var self = this;
    self.$$applyAsyncQueue.push(function() {
        self.$eval(expr);
    });
    if (self.$$applyAsyncId === null) {
        self.$$applyAsyncId = setTimeout(function() {
            self.$apply(function() {
                while (self.$$applyAsyncQueue.length) {
                    // 执行applyAsyncQueue队列中的第一个函数并在数组里删除它
                    self.$$applyAsyncQueue.shift()();
                }
                self.$$applyAsyncId = null;
            });
        }, 0);
    }
};
```
$applyAsync的另一方面是它不应该发起一个$digest,如果在这个timeout触发之前恰好因为其他原因被启动，在那些情况下，$digest应该排在队列里并且$applyAsync timeout应该被调用。