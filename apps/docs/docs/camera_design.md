1.相机是在 `Viewport` 里创建的。
2.相机控制器camera_controller里有相机实例
3.相机控制器camera_controller里的相机实例是从viewport中获取到的，实际作用的是子类camera_controller2d
4.初始化viewport时，在构造流程里创建相机
5.veiwport的构造流程是在viewportMgr创建viewports方法里触发的
6.viewportMgr是skCanvas管理的
7.skCanvas在createEditor里会触发_viewportMgr的createViewports方法创建veiwport

1.cameraControllerMgr是app层管理的
2.cameraControllerMgr的作用，管理cameraController、负责事件分发
3.cameraController是在cameraControllerMgr的resetController里创建的



app->CameraControllerMgr->CameraController   
                     -- CameraController2d

1.app中激活cameraControllerMgr->负责绑定分发事件的功能
2.app创建画布->createEditor获取viewports->resetController(viewports)方法创建cameraController
3.createEditor->viewportMgr创建Viewport->创建Camera