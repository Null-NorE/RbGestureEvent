"use strict";
import { RbGestureEvent, RbEventState } from './RbGestureEvent.mjs';

/**
 * @name main
 * @description 主函数
 * @param {Event} event 事件
 * @function
 * @returns {void}
*/
const main = event => {
   console.log('loading main.js');

   /**
    * @type {HTMLDivElement}
    */
   const button = document.querySelector('#mid-in');

   const gesture = new RbGestureEvent(true);
   const clickf = event => {
      console.log('click');
   }
   gesture.registerEventListener(button, 'click', clickf);
   gesture.registerEventListener(button, 'press', event => console.log('press'));
   button.addEventListener('pointermove', e => e.preventDefault());
   // gesture.cancelEventListener(button, 'click', clickf);
}

window.document.addEventListener('DOMContentLoaded', main);