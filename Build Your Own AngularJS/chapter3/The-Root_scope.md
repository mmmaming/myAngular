到目前为止，我们一直使用单个scope对象，我们使用Scope构造函数创建
`var scope = new Scope();`
像这样创建的scope是 root scope。它被称为root scope的原因是它没有父。这是典型的子作用域的整个树的跟作用域。事实上，你永远不会用这种方式创建一个root scope，在Angular里面，只有一个root scope，（通过注入`$rootScope`可用）其他scope全是它的后代，为其创建controller和directive。