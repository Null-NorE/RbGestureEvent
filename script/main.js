"use strict";
import { RbGestureEvent } from './RbGestureEvent.mjs';

/**
 * @name main
 * @description 主函数
 * @param {Event} event 事件
 * @function
 * @returns {void}
*/
const main = event => {
   console.log('loading main.js');

   const button = document.querySelector('#mid-in');

   const gesture = new RbGestureEvent(true);
   const clickf = event => {
      console.log('click');
   }
   const clickfcb = gesture.registerEvent(button, 'click', clickf);
   gesture.cancelEvent(button, 'click', clickfcb);

}

window.document.addEventListener('DOMContentLoaded', main);