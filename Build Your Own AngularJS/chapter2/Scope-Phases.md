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