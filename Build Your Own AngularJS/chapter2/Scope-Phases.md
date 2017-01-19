`$evalAsync`做的另一件事情是调度一个`$digest`,如果当前没有正在进行的$digest的话。
这意味着，无论什么时候调用$evalAsync,都可以确保你延迟的函数可以很快的被调用，而不是需要等待别的什么东西去触发一个digest;

---
虽然`$evalAsync`会调度一个`$digest`,但是在一个`$digest`中执行异步代码的首选方法还是用`$applyAsync`,下一节会介绍它。
--
对此，我们需要给`$evalAsync`一些方法去检查一个`$digest`是否已经在进行中。在这种情况下吗，它不会干扰一个调度。为了这个目的，Angular实现了一个叫做`phase`的东西,它只是一个简单的储存当前正在进行的信息的`scope`上的一个字符串属性。
现在让我们给单元测试加一个叫做`$$phase`的字段,它在`$digest`期间叫做`digest`，在`$apply`调用期间叫做`apply`，其他时间为`null`值，在`describe($digest)`中添加这个单元测试。

```
it('has a $$phase field whose value is the current digest phase', function() {
    scope.aValue = [1, 2, 3];
    scope.phaseInWatchFunction = undefined;
    scope.phaseInListenerFunction = undefined;
    scope.phaseInApplyFunction = undefined;
    scope.$watch(
        function(scope) {
            scope.phaseInWatchFunction = scope.$$phase;
            return scope.aValue;
        },
        function(newValue, oldValue, scope) {
            scope.phaseInListenerFunction = scope.$$phase;
        }
    );
    scope.$apply(function(scope) {
        scope.phaseInApplyFunction = scope.$$phase;
    });
    expect(scope.phaseInWatchFunction).toBe('$digest');
    expect(scope.phaseInListenerFunction).toBe('$digest');
    expect(scope.phaseInApplyFunction).toBe('$apply');
});
```

---
我们不需要显示的调用`$digest`,因为`$apply`已经帮我们调用过了。
---

在`Scope`的`Constructor`中，加入一个`$$phase`字段，并初始化一个`null`值。

接下来，让我们定义一对儿用于控制`phase`的函数，一个用来设置`phase`,一个用来清除`phase`。
让我们添加一个额外的检查去确保当一个`$$phase`已经在激活时，不会再去设置它。

```
Scope.prototype.$beginPhase = function(phase) {
    if (this.$$phase) {
        throw this.$$phase + ' already in progress.';
    }
    this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
    this.$$phase = null;
};
```
In $digest, let’s now set the phase as ”$digest” for the duration of the outer digest loop
```
Scope.prototype.$digest = function() {
    // time to live 
    var ttl = 10;
    var dirty;
    this.$$lastDirtyWatch = null;
    this.$beginPhase('$digest');
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
};
```
接下来调整`$apply`，也为它设置`$$phase`属性
```
Scope.prototype.$apply = function(expr) {
    try{
        this.$beginPhase('$apply');

        return this.$eval(expr);
    } finally {
        this.$clearPhase();
        this.$digest();
    }
};
```
最后，我们可以将`$digest`的调度添加到`$evalAsync`中。在describe('$evalAsync')测试块中添加一个单元测试：

```
it('schedules a digest in $evalAsync', function(done) {
            scope.aValue = 'abc';
            scope.counter = 0;
            scope.$watch(
                function(scope) { return scope.aValue; },
                function(newValue, oldValue, scope) {
                    scope.counter++;
                }
            );
            scope.$evalAsync(function(scope) {
            });
            expect(scope.counter).toBe(0);
            setTimeout(function() {
                expect(scope.counter).toBe(1);
                done();
            }, 50);
        });
```

让我们检查一下$digest是否真的运行了，而不是在$evalAsync调用期间，只是稍微晚了那么一点儿点儿。(让我们检查一下$digest是否真的在$evalAsync运行完之后稍晚了那么一点儿点儿时间运行。).我们定义的稍后是50毫秒，setTimeout在Jasmine中工作，我们使用了它的异步测试支持，测试用例函数接收一个可选的完成回调参数，并且当我们调用它后只完成一次，在我们用timeout之后。现在$evalAsync函数可以检查当前scope上的phase，并且如果它不存在，调度一个$digest.

```
Scope.prototype.$evalAsync = function(expr) {
    var self = this;
    if (!self.$$phase && !self.$$asyncQueue.length) {
        setTimeout(function() {
            if (self.$$asyncQueue.length) {
                self.$digest();
            }
        }, 0);
    }
    self.$$asyncQueue.push({scope: self, expression: expr});
};
```

注意：我们在两个地方检查了当前异步队列的长度：

1.在调用setTimeout之前，我们要确保队列是空的，这是因为我们不想调用过多的setTimeout函数，超出我们的需要。如果队列里已经有值了，我们已经有了一个超时设置并且最终会消耗这个队列。（we already
have a timeout set and it will eventually drain the queue）。

2.在setTimeout函数内部我们要确保队列不是空的。在timeout函数执行之前，队列可能已经被其他一些原因消耗尽了。我们不想再开始一个不必要的$digest，如果我们已经没什么可做的话。

有了这个实现，你可以确保当你调用$evalAsync的时候，一个$digest马上就会发生,不论你何时何地的调用它。

如果在一个$digest已经运行的期间调用$evalAsync,你的函数将计算这个$digest.如果没有$digest运行，则启动一个$digest来运行。我们使用setTimeout去稍微延迟开始这个$digest.这个$evalAsync调用方法可以确保函数立即返回，而不是同步的去计算这个表达式，而不管digest周期的当前状态。