"use strict";
// 版本号，用于调试
const version = 'beta 0.2.4.c';

/** 
 * @name debug 
 * @description 是否开启调试模式
 * @type {Boolean}
 * @default false
 */
let debug = false;

const EVENTLIST = Symbol.for('RBEventList');
const LONGTOUCH = Symbol.for('RBLongtouch');
const CBMAPPING = Symbol.for('RBCallbackMapping');

/**
 * @name PointerInfo
 * @description 指针信息类
 * @class
 * @member {Boolean} move 是否移动
 * @member {Boolean} firstMove 是否第一次移动
 * @member {Array<Number>} velocity 速度
 * @member {Array<Number>} displacement 指针相对于初始位置的位移
 * @member {Array<Number>} location 指针当前位置
 * @member {Array<Number>} startLocation 初始位置
 * @member {Number} velocityTimeOut 速度清零计时器
 * @private
 */
class PointerInfo {
   move = false;
   firstMove = false;
   velocity = [0, 0];
   displacement = [0, 0];
   location = [0, 0];
   startLocation = [0, 0];
   velocityTimeOut = setTimeout(() => { }, 1);
}

/**
 * @name RbEventState
 * @description 事件状态类
 * @class
 * @member {Date} time 事件发生时间
 * @member {String} eventType 事件类型
 * @member {Number} scale 相对于初始双指针间距的比例
 * @member {Number} deltaAngle 相对于初始角度的角度变化
 * @member {Array<Number>} midPoint 第一个和第二个指针连线的中点
 * @member {Number} maxPoint 从第一个指针接触开始到现在的最大指针数 用法：maxPoint == 1 ? 单指操作 : 多指操作
 * @member {Number} clickCount 点击次数
 * @member {Array<Number>} lastClickLocation 上次点击位置
 * @member {Date} lastClickTime 上次点击时间
 * @member {Boolean} isRotate 是否旋转
 * @member {Boolean} firstRotate 是否第一次触发旋转事件
 * @member {Boolean} isPinch 是否缩放
 * @member {Boolean} firstPinch 是否第一次触发缩放事件
 * @member {Number} startLenth 初始长度
 * @member {Number} startAngle 初始角度
 * @member {Date} startTime 初始时间
 * @member {Map<Number, PointerInfo>} pointers 指针信息
 * @member {PointerInfo} triggerPointer 触发指针
 * @member {Number} pointerCount 指针数量
 * @member {PointerEvent} originEvent 原始事件
 */
class EventState {
   time = Date.now();
   eventType = '';

   scale = 1;
   deltaAngle = 0;
   midPoint = [0, 0];

   maxPoint = 0;
   clickCount = 0;
   lastClickLocation = [0, 0];
   lastClickTime = Date.now();

   isRotate = false;
   firstRotate = false;
   isPinch = false;
   firstPinch = false;

   startLength = 0;
   startAngle = 0;
   startTime = Date.now();

   pointers = new Map();
   triggerPointer = new PointerInfo;
   pointerCount = 0;

   originEvent = new PointerEvent('none');
}

/**
 * @name eventConditions
 * @description 事件条件对象，包含用于判断各种事件类型的条件函数
 * @type {Record<String, (ev: EventState, lev: EventState, tri: String) => Boolean>}
 * @private
 * @constant
 */
const eventConditions = {
   'press': (ev, lev, tri) => {
      const isDown = ev.eventType == 'down' && tri == 'down';
      return isDown;
   },
   'release': (ev, lev, tri) => {
      const isUp = ev.eventType == 'up' && tri == 'up';
      return isUp;
   },
   'click': (ev, lev, tri) => {
      if (eventConditions['release'](ev, lev, tri) && ev.pointerCount == 0) {
         return ev.clickCount >= 1;
      } else return false;
   },
   'doubleclick': (ev, lev, tri) => {
      if (eventConditions['click'](ev, lev, tri)) {
         return ev.clickCount % 2 == 0 && ev.clickCount > 0;
      } else return false;
   },
   'longtouch': (ev, lev, tri) => {
      if (tri == 'longtouch') {
         const isDelayEnough = Date.now() - ev.startTime >= 500;
         const isSinglePointer = ev.maxPoint == 1;
         const isMove = !ev.triggerPointer.move;
         return isDelayEnough && isSinglePointer && isMove;
      } else return false;
   },

   /* dragEvent */
   'dragstart': (ev, lev, tri) => {
      if (tri == 'move') {
         // 判断是否是单指操作，是否是第一次移动触发，是否移动了
         const isSinglePointer = ev.maxPoint == 1;
         const isFirstMove = ev.triggerPointer.firstMove;
         const isMove = ev.triggerPointer.move;
         return isSinglePointer && isFirstMove && isMove;
      } else return false;
   },
   'dragmove': (ev, lev, tri) => {
      if (tri == 'move') {
         // 判断是否是单指操作，是否不是第一次移动触发，是否移动了
         const isSinglePointer = ev.maxPoint == 1;
         const isNotFirstMove = !ev.triggerPointer.firstMove;
         const isMove = ev.triggerPointer.move;
         return isSinglePointer && isMove && isNotFirstMove;
      } else return false;
   },
   'dragend': (ev, lev, tri) => {
      if (tri == 'up' || tri == 'move') {
         // 指针抬起前的最大指针数为1，且是移动操作
         const isSinglePointer = lev.maxPoint == 1;
         const isMove = ev.triggerPointer.move;
         return isSinglePointer && isMove;
      }
   },
   'dragcancel': (ev, lev, tri) => {
      if (tri == 'cancel') {
         // 指针抬起前的最大指针数为1，且是移动操作
         const isSinglePointer = lev.maxPoint == 1;
         const isMove = ev.triggerPointer.move;
         return isSinglePointer && isMove;
      } else return false;
   },
   'dragleft': (ev, lev, tri) => {
      if (eventConditions['dragmove'](ev, lev, tri)) {
         const isLeft = ev.triggerPointer.displacement[0] < 0;
         return isLeft;
      } else return false;
   },
   'dragright': (ev, lev, tri) => {
      if (eventConditions['dragmove'](ev, lev, tri)) {
         const isRight = ev.triggerPointer.displacement[0] > 0;
         return isRight;
      } else return false;
   },
   'dragup': (ev, lev, tri) => {
      if (eventConditions['dragmove'](ev, lev, tri)) {
         const isUp = ev.triggerPointer.displacement[1] < 0;
         return isUp;
      } else return false;
   },
   'dragdown': (ev, lev, tri) => {
      if (eventConditions['dragmove'](ev, lev, tri)) {
         const isDown = ev.triggerPointer.displacement[1] > 0;
         return isDown;
      } else return false;
   },

   /* doubelDragEvent */
   'doubledragstart': (ev, lev, tri) => {
      if (tri == 'move') {
         // 判断是否是双指操作，是否是第一次移动触发，是否移动了
         const isTwoPointer = ev.maxPoint == 2;
         const isFirstMove = ev.triggerPointer.firstMove;
         const isMove = ev.triggerPointer.move;
         return isTwoPointer && isFirstMove && isMove;
      } else return false;
   },
   'doubledragmove': (ev, lev, tri) => {
      if (tri == 'move') {
         // 判断是否是双指操作，是否不是第一次移动触发，是否移动了
         const isTwoPointer = ev.maxPoint == 2;
         const isNotFirstMove = !ev.triggerPointer.firstMove;
         const isMove = ev.triggerPointer.move;
         return isTwoPointer && isMove && isNotFirstMove;
      } else return false;
   },
   'doubledragend': (ev, lev, tri) => {
      if (tri == 'up') {
         // 指针抬起前的最大指针数为2，且是移动操作
         const isTwoPointer = lev.maxPoint == 2;
         const isMove = ev.triggerPointer.move;
         return isTwoPointer && isMove;
      } else return false;
   },
   'doubledragcancel': (ev, lev, tri) => {
      if (tri == 'cancel') {
         // 指针抬起前的最大指针数为2，且是移动操作
         const isTwoPointer = lev.maxPoint == 2;
         const isMove = ev.triggerPointer.move;
         return isTwoPointer && isMove;
      } else return false;
   },

   /* swipeEvent */
   'swipeleft': (ev, lev, tri) => {
      if (tri == 'up') {
         const [disX, disY] = ev.triggerPointer.displacement;
         const isSinglePointer = ev.pointerCount == 0;
         const isLeftEnough = disX < -10;
         const isLeftMost = disX < 0 && Math.abs(disX) > Math.abs(disY);
         const isMove = ev.triggerPointer.move;
         const velocityEnough = ev.triggerPointer.velocity[0] < -0.3;
         return isSinglePointer && isMove && isLeftMost && isLeftEnough && velocityEnough;
      } else return false;
   },
   'swiperight': (ev, lev, tri) => {
      if (tri == 'up') {
         const [disX, disY] = ev.triggerPointer.displacement;
         const isSinglePointer = ev.pointerCount == 0;
         const isRightEnough = disX > 10;
         const isRightMost = disX > 0 && Math.abs(disX) > Math.abs(disY);
         const isMove = ev.triggerPointer.move;
         const velocityEnough = ev.triggerPointer.velocity[0] > 0.3;
         return isSinglePointer && isMove && isRightMost && isRightEnough && velocityEnough;
      } else return false;
   },
   'swipeup': (ev, lev, tri) => {
      if (tri == 'up') {
         const [disX, disY] = ev.triggerPointer.displacement;
         const isSinglePointer = ev.pointerCount == 0;
         const isUpEnough = disY < -10;
         const isUpMost = disY < 0 && Math.abs(disY) > Math.abs(disX);
         const isMove = ev.triggerPointer.move;
         const velocityEnough = ev.triggerPointer.velocity[1] < -0.3;
         return isSinglePointer && isMove && isUpMost && isUpEnough && velocityEnough;
      } else return false;
   },
   'swipedown': (ev, lev, tri) => {
      if (tri == 'up') {
         const [disX, disY] = ev.triggerPointer.displacement;
         const isSinglePointer = ev.pointerCount == 0;
         const isDownEnough = disY > 10;
         const isDownMost = disY > 0 && Math.abs(disY) > Math.abs(disX);
         const isMove = ev.triggerPointer.move;
         const velocityEnough = ev.triggerPointer.velocity[1] > 0.3;
         return isSinglePointer && isMove && isDownMost && isDownEnough && velocityEnough;
      } else return false;
   },


   /* pinchEvent */
   'pinchstart': (ev, lev, tri) => {
      if (tri == 'move') {
         // 是否是第一次触发，两指间距是否改变了
         const isPinch = ev.isPinch;
         const firstPinch = ev.firstPinch;
         return isPinch && firstPinch;
      } else return false;
   },
   'pinchmove': (ev, lev, tri) => {
      if (tri == 'move') {
         // 是否不是第一次触发，两指间距是否改变了
         const isPinch = ev.isPinch;
         const firstPinch = ev.firstPinch;
         return isPinch && !firstPinch;
      } else return false;
   },
   'pinchend': (ev, lev, tri) => {
      if (tri == 'up') {
         const isPinch = lev.isPinch;
         const isPinchEnd = !ev.isPinch;
         return isPinch && isPinchEnd;
      } else return false;
   },
   'pinchcancel': (ev, lev, tri) => {
      if (tri == 'cancel') {
         const isPinch = lev.isPinch;
         const isPinchEnd = !ev.isPinch;
         return isPinch && isPinchEnd;
      } else return false;
   },
   'pinchin': (ev, lev, tri) => {
      if (eventConditions['pinchmove'](ev, lev, tri)) {
         const isPinchIn = ev.scale < 1;
         return isPinchIn;
      } else return false;
   },
   'pinchout': (ev, lev, tri) => {
      if (eventConditions['pinchmove'](ev, lev, tri)) {
         const isPinchOut = ev.scale > 1;
         return isPinchOut;
      } else return false
   },

   /* rotateEvent */
   'rotatestart': (ev, lev, tri) => {
      if (tri == 'move') {
         // 是否是第一次触发，两指角度是否改变了
         const isRotate = ev.isRotate;
         const firstRotate = ev.firstRotate;
         return isRotate && firstRotate;
      } else return false;
   },
   'rotatemove': (ev, lev, tri) => {
      if (tri == 'move') {
         // 是否不是第一次触发，两指角度是否改变了
         const isRotate = ev.isRotate;
         const firstRotate = ev.firstRotate;
         return isRotate && !firstRotate;
      } else return false;
   },
   'rotateend': (ev, lev, tri) => {
      if (tri == 'up') {
         const isRotate = lev.isRotate;
         const isRotateEnd = !ev.isRotate;
         return isRotate && isRotateEnd;
      } else return false;
   },
   'rotatecancel': (ev, lev, tri) => {
      if (tri == 'cancel') {
         const isRotate = lev.isRotate;
         const isRotateEnd = !ev.isRotate;
         return isRotate && isRotateEnd;
      } else return false;
   },
};

/**
 * @name RbGestureEvent
 * @description 手势事件类
 * @class
 * @member {RbEventState} eventState 事件状态
 * @member {RbEventState} lastEventState 上一次事件状态
 * @member {RbEventState} outEventState 输出事件状态
 */
class GestureEvent {
   /**
    * @description 事件状态
    * @type {EventState}
    * @private
    */
   static eventState = new EventState;

   /**
    * @description 上一次事件状态
    * @type {EventState}
    * @private
    */
   static lastEventState = new EventState;

   /**
    * @description 输出事件状态
    * @type {EventState}
    */
   static outEventState = new EventState;

   /**
    * @description 事件是否触发
    * @type {Record<String, (ev: EventState, lev: EventState, tri: String) => Boolean>}
    */
   static condition = {};

   /**
    * @description 配置
    * @type {Record<String, Number>}
    * @private
    * @constant
    * @member {Number} threshold 识别需要的最小位移
    */
   static config = {
      threshold: 5,
      clickThreshold: 500,
      longtouchThreshold: 500,
      angleThreshold: 5,
      scaleThreshold: 0.05,
   }

   /**
    * @name 构造函数
    * @constructor
    * @returns {GestureEvent} - 返回一个RbGestureEvent实例
    * @description 构造函数
    */
   constructor() {
      // 监听触摸相关事件
      document.addEventListener('DOMContentLoaded', () => {
         [
            ['pointerdown', GestureEvent.pointerdown],
            ['pointermove', GestureEvent.pointermove],
            ['pointerup', GestureEvent.pointerup],
            ['pointercancel', GestureEvent.pointerCancel],
         ].forEach(n => window.addEventListener(n[0], n[1], true));
      });
   }

   /**
    * @description 设置调试模式
    * @param {Boolean} _debug - 是否开启调试模式
    */
   static setDebug(_debug) {
      debug = _debug;
      if (debug) console.log(
         `%cRbGestureEvent - debug mode on, version: ${version}`,
         `
         color: white;
         background-color: #333333; 
         font-weight: bold;
         text-shadow: 0 0 5px white;
         padding: 0.5em;
         border-left: 5px solid #ff0000;
         border-right: 5px solid #ff0000;
         `
      );
   }

   /**
    * @description 处理originEvent并克隆状态
    * @param {Object} targetState - 目标状态对象
    */
   static cloneStateTo(targetState) {
      const event = GestureEvent.eventState.originEvent;
      GestureEvent.eventState.originEvent = null;

      GestureEvent[targetState] = structuredClone(GestureEvent.eventState);
      GestureEvent[targetState].originEvent = event;

      GestureEvent.eventState.originEvent = event;
   }

   /**
    * @description 拷贝eventState的数据到lastEventState
    */
   static copyStateToLast() {
      this.cloneStateTo('lastEventState');
      GestureEvent.lastEventState.time = Date.now();
   }

   /**
    * @description 将eventState的数据拷贝到outEventState
    */
   static copyState() {
      this.cloneStateTo('outEventState');
   }

   /**
    * 更新指针状态数据
    * @param {PointerEvent} event - 指针事件
    * @param {EventState} eventState - 当前事件状态
    * @param {String} eventType - 事件类型 (down/move/up/cancel)
    * @private
    */
   static updateEventState(event, eventState, eventType) {
      const id = event.pointerId;

      eventState.originEvent = event;
      eventState.time = Date.now();
      eventState.eventType = eventType;
      eventState.triggerPointer = eventState.pointers.get(id);
   }

   /**
    * 初始化双指手势计算
    * @param {EventState} eventState - 当前事件状态
    * @private 
    */
   static initializeTwoPointerState(eventState) {
      const twoPointerLocation = [...eventState.pointers.values()]
         .slice(0, 2)
         .map(p => [p.location[0], p.location[1]]);

      eventState.startLength = GestureEvent.eDistance(...twoPointerLocation);
      eventState.startAngle = GestureEvent.refAngle(...twoPointerLocation);
      eventState.midPoint = GestureEvent.midPoint(...twoPointerLocation);
   }

   /**
    * 更新双指手势计算
    * @param {EventState} eventState - 当前事件状态
    * @private
    */
   static updateTwoPointerState(eventState) {
      const twoPointerLocation = [...eventState.pointers.values()]
         .slice(0, 2)
         .map(p => [p.location[0], p.location[1]]);

      const nowLength = GestureEvent.eDistance(...twoPointerLocation);
      const nowAngle = GestureEvent.refAngle(...twoPointerLocation);

      eventState.scale = nowLength / eventState.startLength;
      eventState.deltaAngle = nowAngle - eventState.startAngle;
      eventState.midPoint = GestureEvent.midPoint(...twoPointerLocation);
   }

   /**
    * 更新指针移动速度
    * @param {Object} pointer - 指针状态对象
    * @param {EventState} lastState - 上一次事件状态
    * @param {Number} id - 指针ID
    * @private
    */
   static updateVelocity(pointer, lastState, id) {
      clearTimeout(pointer.velocityTimeOut);

      pointer.velocityTimeOut = setTimeout(() => {
         pointer.velocity = [0, 0];
      }, 100);

      const deltaTime = Date.now() - lastState.time;
      pointer.velocity = [
         (pointer.location[0] - lastState.pointers.get(id).location[0]) / deltaTime,
         (pointer.location[1] - lastState.pointers.get(id).location[1]) / deltaTime
      ];
   }

   /**
    * 指针按下事件处理器
    * @param {PointerEvent} event 
    */
   static pointerdown = event => {
      GestureEvent.copyStateToLast();
      const eventState = GestureEvent.eventState;

      GestureEvent.updateEventState(event, eventState, 'down');

      // 初始化新的指针数据
      const id = event.pointerId;
      eventState.pointers.set(id, {
         move: false,
         firstMove: false,
         velocity: [0, 0],
         displacement: [0, 0],
         location: [event.clientX, event.clientY],
         startLocation: [event.clientX, event.clientY],
         velocityTimeOut: setTimeout(() => { }, 100)
      });

      eventState.triggerPointer = eventState.pointers.get(id);
      eventState.pointerCount++;
      eventState.maxPoint = Math.max(eventState.maxPoint, eventState.pointerCount);

      if (eventState.pointerCount == 1) {
         eventState.startTime = Date.now();
      }

      if (eventState.pointerCount == 2) {
         GestureEvent.initializeTwoPointerState(eventState);
      }

      GestureEvent.copyState();
   }

   /**
    * 指针移动事件处理器  
    * @param {PointerEvent} event
    */
   static pointermove = event => {
      GestureEvent.copyStateToLast();
      const eventState = GestureEvent.eventState;
      const lastState = GestureEvent.lastEventState;

      if (eventState.pointerCount < 1) return;

      const id = event.pointerId;
      const pointer = eventState.pointers.get(id);
      const displacement = [
         event.clientX - pointer.startLocation[0],
         event.clientY - pointer.startLocation[1]
      ];
      if (Math.hypot(...displacement) > GestureEvent.config.threshold) {
         GestureEvent.updateEventState(event, eventState, 'move'); // 因为triggerPointer是引用类型，所以即使还没更新指针数据，triggerPointer也会随着eventState.pointers更新

         // 更新指针状态
         pointer.firstMove = !pointer.move;
         pointer.move = true;
         pointer.location = [event.clientX, event.clientY];
         pointer.displacement = displacement;

         GestureEvent.updateVelocity(pointer, lastState, id);

         if (eventState.pointerCount >= 2) {
            GestureEvent.updateTwoPointerState(eventState);
         }
         eventState.firstRotate = !eventState.isRotate;
         eventState.isRotate = Math.abs(eventState.deltaAngle) >= GestureEvent.config.angleThreshold || eventState.isRotate;
         eventState.firstPinch = !eventState.isPinch;
         eventState.isPinch = Math.abs(1 - eventState.scale) >= GestureEvent.config.scaleThreshold || eventState.isPinch;

         GestureEvent.copyState();
      }
   }

   /**
    * 指针抬起事件处理器
    * @param {PointerEvent} event
    */
   static pointerup = event => {
      GestureEvent.copyStateToLast();
      const eventState = GestureEvent.eventState;

      GestureEvent.updateEventState(event, eventState, 'up');

      eventState.pointers.delete(event.pointerId);
      eventState.pointerCount--;
      if (eventState.maxPoint == 1 && eventState.startTime - eventState.time < 500 && !eventState.triggerPointer.move) {
         if (GestureEvent.eDistance(eventState.triggerPointer.location, eventState.lastClickLocation) < 20 && Date.now() - eventState.lastClickTime < 500) {
            eventState.clickCount++;
         } else {
            eventState.clickCount = 1;
         }
         eventState.lastClickTime = Date.now();
         eventState.lastClickLocation = [...eventState.triggerPointer.location];
      } else {
         eventState.clickCount = 0;
      }
      if (eventState.pointerCount < 2) {
         eventState.isRotate = false;
         eventState.isPinch = false;
         eventState.deltaAngle = 0;
         eventState.scale = 1;
      }
      if (eventState.pointerCount == 0) {
         eventState.maxPoint = 0;
      }

      GestureEvent.copyState();
   }

   /**
    * 指针取消事件处理器
    * @param {PointerEvent} event 
    */
   static pointerCancel = event => {
      GestureEvent.copyStateToLast();
      const eventState = GestureEvent.eventState;

      GestureEvent.updateEventState(event, eventState, 'cancel');

      eventState.pointers.delete(event.pointerId);
      eventState.pointerCount--;
      if (eventState.pointerCount < 2) {
         eventState.isRotate = false;
         eventState.isPinch = false;
         eventState.deltaAngle = 0;
         eventState.scale = 1;
      }
      if (eventState.pointerCount == 0) {
         eventState.maxPoint = 0;
      }

      GestureEvent.copyState();
   }

   /**
    * 注册事件
    * @param {HTMLElement} element 元素
    * @param {String} type 事件类型
    * @param {(eventState: EventState) => void} callback 回调函数
    * @returns {void} - 无返回值
    */
   static registerEventListener(element, type, callback) {
      if (eventConditions[type] == undefined) {
         throw new Error(`event type ${type} not found`);
      }

      // 如果元素没有事件列表，添加事件监听器，否则直接添加事件
      if (!element[EVENTLIST]) {
         element[EVENTLIST] = {};
         element.addEventListener('pointerdown', GestureEvent.downDispatch);
         element.addEventListener('pointermove', GestureEvent.moveDispatch);
         element.addEventListener('pointerup', GestureEvent.upDispatch);
         element.addEventListener('pointerout', GestureEvent.outDispatch);
         element.addEventListener('pointercancel', GestureEvent.cancelDispatch);
      }
      if (!element[EVENTLIST][type]) {
         element[EVENTLIST][type] = [];
      }

      let boundcallback;
      // 判断是否是匿名函数
      if (callback.name != '') {
         // 将未修饰回调函数和修饰后的回调函数的对应关系保存起来
         if (!element[CBMAPPING]) {
            element[CBMAPPING] = new Map;
            boundcallback = callback.bind(element);
            element[CBMAPPING].set(callback, {
               boundcallback: boundcallback,
               count: 1
            });
         } else if (element[CBMAPPING].has(callback)) { // 如果已经注册过了，直接取出来，计数加一，debug模式下输出重复注册警告
            if (debug) console.warn('callback already registered\n', callback);
            const temp = element[CBMAPPING].get(callback);
            boundcallback = temp.boundcallback;
            temp.count += 1;
         }
      } else boundcallback = callback.bind(element);

      element[EVENTLIST][type].push(boundcallback);

      if (debug) {
         console.log(`register event: ${type} on`, element);
         console.log('eventList:', element[EVENTLIST])
      };
   }

   /**
    * 注销事件
    * @param {HTMLElement} element 元素
    * @param {String} type 事件类型
    * @param {Function} callback 回调函数
    * @returns {void} - 无返回值
    */
   static cancelEventListener(element, type, callback) {
      if (debug) console.log(`cancel event: ${type} on`, element);

      if (element[CBMAPPING].has(callback)) {
         const list = element[EVENTLIST][type];
         let { boundcallback, count } = element[CBMAPPING].get(callback);

         const index = list.indexOf(boundcallback);
         list.splice(index, 1);

         count -= 1;
         if (count == 0)
            element[CBMAPPING].delete(callback);

         if (element[EVENTLIST][type].length == 0) {
            delete element[EVENTLIST][type];

            if (Object.keys(element[EVENTLIST]).length == 0) {
               delete element[EVENTLIST];
               element.removeEventListener('pointerdown', GestureEvent.downDispatch);
               element.removeEventListener('pointermove', GestureEvent.moveDispatch);
               element.removeEventListener('pointerup', GestureEvent.upDispatch);
               element.removeEventListener('pointerout', GestureEvent.outDispatch);
               element.removeEventListener('pointercancel', GestureEvent.cancelDispatch);
            }
         }

         if (debug) console.log('eventList:', element[EVENTLIST]);
      } else {
         if (debug) console.error(`callback not found\n`, `eventList:`, element[EVENTLIST], '\n', `callback:`, callback);
         throw new Error('callback not found');
      }
   }

   /**
    * @description 设置事件触发条件
    * @param {String} type - 事件类型
    * @param {(ev: EventState, lev: EventState, tri: String) => Boolean} condition - 条件函数
    */
   static setCondition(type, condition) {
      if (eventConditions[type]) {
         if (debug) console.warn(`event type ${type} already exists, will be overwritten`);
      }
      eventConditions[type] = condition;
   }

   /**
    * @description 移除事件触发条件
    * @param {String} type - 事件类型
    */
   static removeCondition(type) {
      if (eventConditions[type]) {
         delete eventConditions[type];
      } else {
         throw new Error(`event type ${type} not found`);
      }
   }

   /**
    * @name downdispatch
    * @description 按下事件调度器
    * @param {PointerEvent} event - 事件 
    */
   static downDispatch() {
      GestureEvent.dispatchEvent(this, 'down');
      if (GestureEvent.eventState.pointerCount == 1)
         this[LONGTOUCH] = setTimeout(() => {
            GestureEvent.longtouchDispatch(this);
         }, GestureEvent.config.longtouchThreshold);
      else if (this[LONGTOUCH])
         clearTimeout(this[LONGTOUCH]);
   }

   static longtouchDispatch(element) {
      GestureEvent.dispatchEvent(element, 'longtouch');
   }

   static moveDispatch() {
      if (GestureEvent.eventState.pointerCount >= 1)
         GestureEvent.dispatchEvent(this, 'move');
   }

   static upDispatch() {
      GestureEvent.dispatchEvent(this, 'up');
      clearTimeout(this[LONGTOUCH]);
   }

   static outDispatch() {
      clearTimeout(this[LONGTOUCH]);
   }

   static cancelDispatch() {
      GestureEvent.dispatchEvent(this, 'cancel');
      clearTimeout(this[LONGTOUCH]);
   }

   /**
    * @name dispatchEvent
    * @description 筛选符合触发条件的事件并执行
    * @param {HTMLElement} element - 元素
    * @param {String} trigger - 触发器, 用于筛选符合触发条件的事件
    */
   static dispatchEvent(element, trigger) {
      for (const type of Object.keys(element[EVENTLIST])) {
         if (eventConditions[type](GestureEvent.eventState, GestureEvent.lastEventState, trigger)) {
            element[EVENTLIST][type].forEach(callback => callback(GestureEvent.outEventState));
         }
      }
   }

   /**
    * @name 计算两点间距离
    * @param {Array} param0 第一个点的坐标
    * @param {Array} param1 第二个点的坐标
    * @returns {Number} - 两点间距离
    */
   static eDistance = ([x1, y1], [x2, y2]) => {
      const [dx, dy] = [x1 - x2, y1 - y2];
      return Math.hypot(dx, dy);
   }

   /**
    * @name 计算参考角(两点连线与垂直方向间夹角)
    * @param {Array} param0 第一个点的坐标
    * @param {Array} param1 第二个点的坐标
    * @returns {Number} - 两点连线与垂直方向间夹角
    */
   static refAngle = ([x1, y1], [x2, y2]) => {
      const [dx, dy] = [x1 - x2, y1 - y2];
      return Math.atan2(dy, dx) / Math.PI * 180;
   }

   /**
    * @name 计算两点连线的中点
    * @param {Array} param0 第一个点的坐标
    * @param {Array} param1 第二个点的坐标
    * @returns {Array} - 两点连线的中点坐标
    */
   static midPoint = ([x1, y1], [x2, y2]) => [(x1 - x2) / 2, (y1 - y2) / 2];
}

const _ = new GestureEvent;// 触发构造函数

export { GestureEvent as RbGestureEvent, EventState as RbEventState, PointerInfo as RbPointerInfo };