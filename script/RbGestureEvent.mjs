"use strict";

/** 
 * @name debug 
 * @description 是否开启调试模式
 * @type {Boolean}
 * @default false
 */
let debug = false;

const EVENTLIST = Symbol('eventList');
const LONGTOUCH = Symbol('longtouch');

/**
 * @name RbEventState
 * @description 事件状态类
 * @class
 * @member {Number} time 事件发生时间
 * @member {String} eventType 事件类型
 * 
 * @member {Number} scale 缩放比例
 * @member {Number} refAngle 参考角
 * @member {Array} midPoint 中点坐标
 * 
 * @member {Number} clickTimes 点击次数
 * 
 * @member {Number} startLenth 初始长度
 * @member {Number} startAngle 初始角度
 * @member {Number} startTime 初始时间
 * 
 * @member {Array} pointers 指针
 * @member {Number} pointerCount 指针数量
 */
class RbEventState {
   time = 0;
   eventType = '';

   scale = 1;
   refAngle = 0;
   midPoint = [0, 0];

   clickTimes = 0;

   startLength = 0;
   startAngle = 0;
   startTime = undefined;

   pointers = [];
   pointerCount = 0;
}

/**
 * @name eventConditions
 * @description 事件条件对象，包含用于判断各种事件类型的条件函数
 * @type {Record<String, (ev: RbEventState, lev: RbEventState) => Boolean>}
 * @private
 * @constant
 */
const eventConditions = {
   'press': (ev, lev) => {
      return ev.eventType == 'down';
   },
   'release': (ev, lev) => {
      return ev.eventType == 'up';
   },
   'click': (ev, lev) => {
      if (eventConditions['release'](ev, lev) && ev.pointerCount == 0) {
         return ev.time - ev.startTime <= 500;
      } else return false;
   },
   'doubleclick': (() => {
      let clickCount = 0;
      let lastClickTime = new Date;
      let lastClickLocation = [0, 0];
      return (ev, lev) => {
         const pointer = lev.pointers[ev.originEvent.pointerId];
         if (eventConditions['click'](ev, lev)) {
            const nowTime = new Date;
            if (nowTime - lastClickTime <= 550 && ((pointer.location[0] - lastClickLocation[0]) ** 2 + (pointer.location[1] - lastClickLocation[1]) ** 2) <= 400) {
               clickCount += 1;
            } else {
               clickCount = 1;
            }
            lastClickTime = new Date;
            lastClickLocation = [...pointer.location];
         }
         if (clickCount == 2) {
            clickCount = 0;
            return true;
         } else return false;
      };
   })(),
   'longtouch': (ev, lev) => { },

   'pinch': (ev, lev) => { },
   'rotate': (ev, lev) => { },
   'drag': (ev, lev) => { },
   'move': (ev, lev) => { },

   /* dragEvent */
   'dragstart': (ev, lev) => { },
   'dragmove': (ev, lev) => { },
   'dragend': (ev, lev) => { },
   'dragcancel': (ev, lev) => { },
   'dragleft': (ev, lev) => { },
   'dragright': (ev, lev) => { },
   'dragup': (ev, lev) => { },
   'dragdown': (ev, lev) => { },

   /* swipeEvent */
   'swipeleft': (ev, lev) => { },
   'swiperight': (ev, lev) => { },
   'swipeup': (ev, lev) => { },
   'swipedown': (ev, lev) => { },

   /* pinchEvent */
   'pinchstart': (ev, lev) => { },
   'pinchmove': (ev, lev) => { },
   'pinchend': (ev, lev) => { },
   'pinchcancel': (ev, lev) => { },
   'pinchin': (ev, lev) => { },
   'pinchout': (ev, lev) => { },

   /* rotateEvent */
   'rotatestart': (ev, lev) => { },
   'rotatemove': (ev, lev) => { },
   'rotateend': (ev, lev) => { },
   'rotatecancel': (ev, lev) => { },
};

/**
 * @name RbGestureEvent
 * @description 手势事件类
 * @class
 * @member {RbEventState} eventState 事件状态
 * @member {RbEventState} lastEventState 上一次事件状态
 * @member {RbEventState} outEventState 输出事件状态
 */
class RbGestureEvent {
   /**
    * @description 事件状态
    * @type {RbEventState}
    * @private
    */
   static eventState = new RbEventState;

   /**
    * @description 上一次事件状态
    * @type {RbEventState}
    * @private
    */
   static lastEventState = new RbEventState;

   /**
    * @description 输出事件状态
    * @type {RbEventState}
    */
   static outEventState = new RbEventState;

   /**
    * @name eventRegistry
    * @description 事件注册表
    * @type {WeakMap}
    */
   eventRegistry = new WeakMap;

   /**
    * @name callbackMapping
    * @description 把传入的原始回调函数映射到bind封装之后的回调函数
    * @type {WeakMap}
    * @private
    */
   callbackMapping = new WeakMap;

   /**
    * @name 构造函数
    * @param {Boolean} _debug 是否开启调试模式
    * @constructor
    * @returns {RbGestureEvent} - 返回一个RbGestureEvent实例
    * @description 构造函数
    */
   constructor(_debug = false) {
      debug = _debug;
      // 监听触摸相关事件
      document.addEventListener('DOMContentLoaded', () => {
         [
            ['pointerdown', pointerdown],
            ['pointermove', pointerdarg],
            ['pointerup', pointerup],
         ].forEach(n => window.addEventListener(n[0], n[1], true));
      });

      if (debug) {
         console.log('loading RbGestureListener');
      }
   }

   /** @description 更新事件状态 */
   updateState(event) {
      RbEventState.lastEventState = structuredClone(eventState);
      RbEventState.lastEventState.time = new Date;

      RbEventState.outEventState = structuredClone(eventState);
      RbEventState.outEventState['originEvent'] = event;
   }

   /**
    * 调用事件
    * @param {String} elementMark 
    * @param {Event} event 事件返回
    */
   __dispatchEvent(elementMark) {
      // 过滤符合条件的事件并执行注册的回调函数
      const eventInput = RbEventState.outEventState;

      const effectiveList = Object.entries(this.eventConditions).filter(
         ([key, value]) => (
            this.eventRegistry.hasOwnProperty(elementMark)
            && this.eventRegistry[elementMark].hasOwnProperty(key)
            && value(eventInput, RbEventState.lastEventState)
         )
      );

      effectiveList.forEach(
         e => this.eventRegistry[elementMark][e[0]].forEach(
            f => f(eventInput)
         )
      );
   }

   /**
    * @name 处理触摸开始事件
    * @param {PointerEvent} event 
    */
   pointerdown(event) {
      const id = event.pointerId;
      const eventState = RbGestureEvent.eventState;

      // 设置事件状态的时间和类型
      eventState.time = new Date;
      eventState.eventType = 'down';

      // 初始化触摸点信息
      eventState.pointers[id] = {
         move: false,
         velocity: [0, 0],
         displacement: [0, 0],
         location: [event.clientX, event.clientY],
         startLocation: [event.clientX, event.clientY],

         // 设置空计时器，防止之后无脑clear的时候出问题
         velocityTimeOut: setTimeout(() => { }, 100)
      };

      // 处理一个触摸点的情况
      if (eventState.pointerCount == 0) {
         eventState.startTime = new Date;
      }

      // 处理两个及以上触摸点的情况
      if (eventState.pointerCount == 1) {
         const twoPointerLocation = [
            [eventState.pointers.values[0].clientX, eventState.pointers.values[0].clientY],
            [eventState.pointers.values[1].clientX, eventState.pointers.values[1].clientY]
         ];

         // 计算两点间的初始长度和角度
         eventState.startLength = RbGestureEvent.eDistance(twoPointerLocation);
         eventState.startAngle = RbGestureEvent.refAngle(twoPointerLocation);

         // 计算两点间的中点
         eventState.midPoint = RbGestureEvent.midPoint(twoPointerLocation);
      }

      // 增加触摸点计数
      eventState.pointerCount += 1;
      this.updateState(event);
   }

   /**
    * @name 处理触摸移动事件
    * @param {PointerEvent} event 
    */
   pointerdrag(event) {
      const eventState = RbGestureEvent.eventState;
      const lastEventState = RbGestureEvent.lastEventState;

      if (eventState.pointerCount >= 1) {
         const id = event.pointerId;
         const pointer = eventState.pointers[id];
         eventState.time = new Date;
         eventState.eventType = 'move';

         /* 如果还在移动就取消清零速度 */
         clearTimeout(pointer.velocityTimeOut);

         /* 100ms之后清零速度（符合条件时会被上面阻止） */
         pointer.velocityTimeOut = setTimeout(() => {
            pointer.velocity = [0, 0];
         }, 100);

         pointer.move = true;
         pointer.location = [event.clientX, event.clientY];
         pointer.displacement = [event.clientX - pointer.startLocation[0], event.clientY - pointer.startLocation[1]];

         const deltaTime = new Date - lastEventState.time;
         pointer.velocity = [
            (pointer.location[0] - lastEventState.pointers[id].location[0]) / deltaTime,
            (pointer.location[1] - lastEventState.pointers[id].location[1]) / deltaTime,
         ];

         if (eventState.pointerCount == 2) {
            const twoPointerLocationg = [
               [eventState.pointers.values[0].clientX, eventState.pointers.values[0].clientY],
               [eventState.pointers.values[1].clientX, eventState.pointers.values[1].clientY]
            ];

            const nowlenth = RbGestureEvent.eDistance(twoPointerLocationg);
            const nowangle = RbGestureEvent.angle(twoPointerLocationg);

            eventState.scale = nowlenth / eventState.startLength;
            eventState.refAngle = nowangle - eventState.startAngle;
            eventState.midPoint = RbGestureEvent.mid(twoPointerLocationg);
         }

         this.updateState(event);
      }
   }

   /**
    * @name 处理触摸结束事件
    * @param {PointerEvent} event 
    */
   pointerup(event) {
      const id = event.pointerId;
      delete RbGestureEvent.eventState.pointers[id];

      RbGestureEvent.eventState.time = new Date;
      RbGestureEvent.eventState.eventType = 'up';
      RbGestureEvent.eventState.pointerCount -= 1;

      this.updateState(event);
   }

   /**
    * 注册事件
    * @param {HTMLElement} element 元素
    * @param {String} type 事件类型
    * @param {Function} callback 回调函数
    * @returns {Function} - 返回一个封装后的回调函数, 用于注销事件
    */
   registerEvent(element, type, callback) {
      if (debug) console.log(`register event: ${type} on`, element);

      if (!element[EVENTLIST]) {
         element[EVENTLIST] = {};
         element.addEventListener('pointerdown', RbGestureEvent.downdispatch, true);
         element.addEventListener('pointermove', RbGestureEvent.movedispatch, true);
         element.addEventListener('pointerup', RbGestureEvent.updispatch, true);
      }
      if (!element[EVENTLIST][type]) {
         element[EVENTLIST][type] = [];
      }

      const boundcallback = callback.bind(element);
      element[EVENTLIST][type].push(boundcallback);

      if (debug) console.log('eventList:', element[EVENTLIST]);

      return boundcallback;
   }

   /**
    * 注销事件
    * @param {HTMLElement} element 元素
    * @param {String} type 事件类型
    * @param {Function} callback 回调函数
    * @returns {void} - 无返回值
    */
   cancelEvent(element, type, callback) {
      if (debug) console.log(`cancel event: ${type} on`, element);

      /** @type {Array} */
      const list = element[EVENTLIST][type];
      const index = list.indexOf(callback);
      if (index != -1) {
         list.splice(index, 1);

         if (element[EVENTLIST][type].length == 0) {
            delete element[EVENTLIST][type];

            if (Object.keys(element[EVENTLIST]).length == 0) {
               delete element[EVENTLIST];
               element.removeEventListener('pointerdown', RbGestureEvent.downdispatch, true);
               element.removeEventListener('pointermove', RbGestureEvent.movedispatch, true);
               element.removeEventListener('pointerup', RbGestureEvent.updispatch, true);
            }
         }

         if (debug) console.log('eventList:', element[EVENTLIST]);
      } else {
         console.error(`callback not found\n`, `eventList:`, element[EVENTLIST], '\n', `callback:`, callback);
      }
   }

   /**
    * @name downdispatch
    * @description 按下事件分发器
    * @param {PointerEvent} event - 事件 
    */
   static downdispatch() {
      if (debug) console.log('down');

      RbGestureEvent.dispatchEvent(this);
      if (RbGestureEvent.eventState.pointerCount == 1)
         this[LONGTOUCH] = setInterval(() => {
            RbGestureEvent.longtouchdispatch();
         }, 100);
      else if (this[LONGTOUCH])
         clearInterval(this[LONGTOUCH]);
   }

   static longtouchdispatch() {
      if (debug) console.log('longtouch');
      RbGestureEvent.dispatchEvent(this);
   }

   static movedispatch() {
      if (debug) console.log('move');
      RbGestureEvent.dispatchEvent(this);
   }

   static updispatch() {
      if (debug) console.log('up');
      RbGestureEvent.dispatchEvent(this);
      clearInterval(this[LONGTOUCH]);
   }

   /**
    * @name dispatchEvent
    * @description 筛选符合触发条件的事件并执行
    * @param {HTMLElement} element - 元素
    */
   static dispatchEvent(element) {
      const keys = Object.keys(element[EVENTLIST]);
      let activeQueue = keys.filter(type => {
         // 执行eventConditions中对应的条件函数
         return eventConditions[type](RbGestureEvent.eventState, RbGestureEvent.lastEventState);
      });
      activeQueue.forEach(
         callback => callback(eventState)
      );
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


const TIKING = Symbol('tiking');
const ANTITIMER = Symbol('antitimer');

/**
 * 代码节流，会返回将输入函数修饰成节流函数
 * @constructor
 * @param {Function} func -需要节流的函数
 * @returns {Function} -修饰成节流函数的func
 */
const Throttle = function (func) {
   /* 为函数分配一个tiking属性，方便之后实现节流 */
   Object.defineProperty(func, TIKING, { value: false, writable: true });

   return function (...arg) {
      if (!func[TIKING]) {
         requestAnimationFrame(() => {
            func(...arg);
            func[TIKING] = false;
         });
         func[TIKING] = true;
      }
   }
}


/**
 * 代码防抖，会返回将输入函数修饰成防抖函数
 * @constructor
 * @param {Function} func -需要防抖的函数
 * @param {Number} time -防抖延时
 * @returns {Function} -修饰成防抖函数的func
 */
const AntiShake = function (func, time) {
   Object.defineProperty(func, ANTITIMER, { writable: true });
   return function (...arg) {
      clearTimeout(func[ANTITIMER]);
      func[ANTITIMER] = setTimeout(() => func(...arg), time);
   }
};

export { RbGestureEvent };