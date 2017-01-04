## _Build Your Own AngularJS_ 
Copyright © 2016 Tero Parviainen

## code environment

1. Node and NPM
2. JSHint
3. Jasmine,Sinon,and Karma

## contents

1. Scope

   Scope抽象
   页面视图数据的存储仓库，并提供对数据的监听方法以及事件传播机制

2. Expression

   Expression抽象
   结合Scope解析表达式。

3. Module and Dependency Injection

   DI抽象
   ng中的module实则为存储应用构成元素生成方法的仓库，ng在启动过程中，会按照依赖解析顺序，一次性生成应用构成元素。而DI机制实现了，函数调用统一入口，从而干预函数调用时的传参。
   具体到应用中，ng将页面的构成元素分为了两种类型：
   provider为在启动阶段可配置的工厂；service为内部固定的工厂。
   injector为对应用构成元素的访问入口。

4. $q

   $q抽象
   Defer描述一个尚未完成的过程，包含了一个promise描述动作完成后的结果。

5. $http

6. Directive(+controllers)
