import {defaults,renderArt} from './card-art.js';
const form=document.querySelector('#controls'),card=document.querySelector('#card'),status=document.querySelector('#status');
let svg='';
function render(){const values={...defaults};for(const key of Object.keys(defaults)){const field=form.elements.namedItem(key);if(field)values[key]=field.type==='checkbox'?field.checked:field.value;}svg=renderArt(values);card.innerHTML=svg;status.textContent='';}
form.addEventListener('input',render);
form.addEventListener('reset',()=>queueMicrotask(render));
document.querySelector('#download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tokensburned-demo.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已下载 SVG，数字为示例数据。';});
render();
