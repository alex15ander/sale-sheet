(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var LINE_URL='https://line.me/R/ti/p/@825gowqf';
var CTA_Q='想看這一區近半年的成交價？';
var CTA_A='LINE@ @825gowqf 傳『區名』給我';
var current=null, editing=false;

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
// 移除任何手機或市話號碼（規則：售資上不出現電話）
function noPhone(s){
  return String(s==null?'':s)
    .replace(/(\+?886[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g,'')
    .replace(/\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{4}/g,'');
}
function has(v){return v!==null&&v!==undefined&&v!==''&&v!==0&&v!=='0'}
function num(v){if(!has(v))return '';var n=Number(v);return isNaN(n)?String(v):String(+n.toFixed(2))}
function withUnit(v,u){var s=num(v);return s?s+' '+u:''}

function parseId(input){
  var m=String(input||'').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m?m[0]:null;
}

function fetchApi(id){
  return fetch('https://www.ycut.com.tw/api/Case/Info/Share/'+id,{mode:'cors',credentials:'omit',headers:{'websiteName':'Case_WS','Accept':'application/json'}})
  .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json()})
  .then(function(j){if(j&&j.data&&j.data.caseCode)return j.data;throw new Error('no data')});
}
function fetchPage(id){
  return fetch('https://www.ycut.com.tw/case-info/'+id,{mode:'cors',credentials:'omit'})
  .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.text()})
  .then(function(html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    var el=doc.getElementById('ng-state');
    if(!el)throw new Error('no state');
    var st=JSON.parse(el.textContent);
    for(var k in st){var b=st[k]&&st[k].b;if(b&&b.data&&b.data.caseCode)return b.data}
    throw new Error('no data');
  });
}
// 先用永義的公開 JSON 介面，失敗再改讀物件頁面
function fetchCase(id){return fetchApi(id).catch(function(e){console.warn('api',e);return fetchPage(id)})}

// 網站沒給地圖時，用 OpenStreetMap 圖磚在瀏覽器裡拼一張位置圖
function osmMap(lat,lng){
  return new Promise(function(resolve){
    if(!lat||!lng){resolve('');return}
    var z=17,W=660,H=560,n=Math.pow(2,z);
    var x=(lng+180)/360*n, r=lat*Math.PI/180, y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;
    var px=x*256-W/2, py=y*256-H/2;
    var c=document.createElement('canvas');c.width=W;c.height=H;var g=c.getContext('2d');
    g.fillStyle='#eee';g.fillRect(0,0,W,H);
    var tx0=Math.floor(px/256),ty0=Math.floor(py/256),tx1=Math.floor((px+W)/256),ty1=Math.floor((py+H)/256);
    var jobs=[];
    for(var tx=tx0;tx<=tx1;tx++)for(var ty=ty0;ty<=ty1;ty++)(function(tx,ty){
      jobs.push(new Promise(function(ok){
        var im=new Image();im.crossOrigin='anonymous';
        im.onload=function(){g.drawImage(im,tx*256-px,ty*256-py);ok()};im.onerror=function(){ok()};
        im.src='https://tile.openstreetmap.org/'+z+'/'+tx+'/'+ty+'.png';
      }));
    })(tx,ty);
    Promise.all(jobs).then(function(){
      g.font='13px sans-serif';var t='© OpenStreetMap contributors';var w=g.measureText(t).width;
      g.fillStyle='rgba(255,255,255,.8)';g.fillRect(W-w-10,H-20,w+10,20);g.fillStyle='#333';g.fillText(t,W-w-5,H-6);
      try{resolve(c.toDataURL('image/png'))}catch(e){resolve('')}
    });
  });
}

// 把網站資料對應到售資欄位；網站沒有的欄位留空，絕不自行推測
function mapFields(d){
  var parts=[];
  if(has(d.buiMPin))parts.push('主建物 '+num(d.buiMPin)+' 坪');
  if(has(d.buiAuxPin))parts.push('附屬 '+num(d.buiAuxPin)+' 坪'+(has(d.porchPin)?'（含陽台 '+num(d.porchPin)+' 坪'+(has(d.rainproofPin)?'／雨遮 '+num(d.rainproofPin)+' 坪':'')+'）':''));
  if(has(d.buiPubPin))parts.push('共同 '+num(d.buiPubPin)+' 坪');
  if(has(d.basementPin))parts.push('地下室 '+num(d.basementPin)+' 坪');
  var layout='';
  if(has(d.rm)||has(d.livingRm)||has(d.bathRm))layout=(d.rm||0)+' 房 '+(d.livingRm||0)+' 廳 '+(d.bathRm||0)+' 衛';
  var floor='';
  if(has(d.floorSt)){floor=(d.floorEn&&d.floorEn!==d.floorSt?d.floorSt+'～'+d.floorEn:d.floorSt)+' 樓'+(has(d.upFloor)?'／共 '+d.upFloor+' 樓':'');}
  var sell=d.sellRent!=='B';
  return {
    caseNo:d.caseCode||'', useLabel:d.caseGrp==='B'?'使用分區':'登記用途', title:d.caseName||'',
    name:d.buildingName||'', addr:d.addrSimp||'',
    floor:floor, type:d.typeCode||'', court:'',
    facing:d.positionName||'', layout:layout, corner:'',
    cond:'', elev:'', use:d.useCode||'',
    road:'', age:has(d.buiYear)?num(d.buiYear)+' 年':'', perFloor:'',
    built:'', regDate:d.twDate||'', key:'',
    price:has(d.price)?num(d.price)+(sell?' 萬':' 元/月'):'', bpin:withUnit(d.buiTotPin,'坪'), lpin:withUnit(d.landShPin,'坪'),
    incl:parts.join('／'),
    struct:'', wall:'', mgmt:'',
    payWay:has(d.mgExpense)?(d.mgCode||''):'', mgFee:withUnit(d.mgExpense,'元'), clean:'',
    pSpace:d.parkingSpace||'', pMgmt:has(d.parkingExpense)?num(d.parkingExpense)+' 元':'', pMode:d.parkingMode||'',
    pRight:'', pType:'', pIncl:withUnit(d.includeParking,'坪'),
    pNo:d.parkingNO||'', pNote:'',
    es:d.priSchoolName||'', js:d.junSchoolName||'', univ:'',
    hs:'', hosp:'', park:'',
    market:'', bus:'', mrt:'',
    train:'',
    spec:noPhone(d.caseSpec||d.sCaseSpec||'').trim(),
    store:[d.storeCompany,d.storeCodeName].filter(Boolean).join(' '),
    mapUrl:d.googleStaticMapUrl||'', planUrl:d.spc||'',
    lat:d.googleMapLati, lng:d.googleMapLongi
  };
}

function blankFields(){var f=mapFields({});f.title='';return f}

function cell(label,key,f,opts){
  opts=opts||{};
  var cls='v'+(opts.cls?' '+opts.cls:'');
  return '<td class="l">'+label+'</td><td class="'+cls+'"'+(opts.span?' colspan="'+opts.span+'"':'')+' data-k="'+key+'" contenteditable="false">'+esc(f[key])+'</td>';
}
function row(){return '<tr>'+Array.prototype.join.call(arguments,'')+'</tr>'}

function render(f){
  current=f;
  var mapImg=f.mapUrl?'<img crossorigin="anonymous" src="'+esc(f.mapUrl)+'" alt="地圖"><div class="pin"></div>':'<span class="ph">位置圖暫未提供<em class="edit-only">（點這裡上傳）</em></span>';
  var planImg=f.planUrl?'<img crossorigin="anonymous" src="'+esc(f.planUrl)+'" alt="格局圖">':'<span class="ph">物件頁暫未提供格局圖<em class="edit-only">（點這裡上傳）</em></span>';
  var h=''+
  '<div class="sheet" id="sheet">'+
   '<div class="head"><div class="no">案號　<b data-k="caseNo" contenteditable="false">'+esc(f.caseNo)+'</b></div><div class="doc">物件個案明細</div></div>'+
   '<div class="title" data-k="title" contenteditable="false">'+esc(f.title)+'</div>'+
   '<table class="grid"><colgroup><col class="l"><col><col class="l"><col><col class="l"><col></colgroup><tbody>'+
   row(cell('物件名稱','name',f,{span:5}))+
   row(cell('物件地址','addr',f,{span:5}))+
   row(cell('樓層','floor',f),cell('樓別','type',f),cell('中庭','court',f))+
   row(cell('朝向','facing',f),cell('格局','layout',f),cell('邊間','corner',f))+
   row(cell('屋況','cond',f),cell('電梯數','elev',f),cell(f.useLabel,'use',f))+
   row(cell('面臨路寬','road',f),cell('屋齡','age',f),cell('每層戶數','perFloor',f))+
   row(cell('完工日期','built',f),cell('登記日期','regDate',f),cell('鑰匙存放','key',f))+
   row(cell('總價','price',f,{cls:'price'}),cell('登記建坪','bpin',f),cell('登記地坪','lpin',f))+
   row(cell('建坪內含','incl',f,{span:5}))+
   row(cell('建物結構','struct',f),cell('外牆材質','wall',f),cell('管理方式','mgmt',f))+
   row(cell('繳費方式','payWay',f),cell('管理費','mgFee',f),cell('清潔費','clean',f))+
   row(cell('停車空間','pSpace',f),cell('車位管理','pMgmt',f),cell('停車方式','pMode',f))+
   row(cell('車位產權','pRight',f),cell('車位型態','pType',f),cell('建坪內含<br>車位','pIncl',f))+
   row(cell('編號','pNo',f),cell('車位說明','pNote',f,{span:3}))+
   row(cell('國小','es',f),cell('國中','js',f),cell('大專','univ',f))+
   row(cell('高中','hs',f),cell('醫院','hosp',f),cell('公園綠地','park',f))+
   row(cell('市場','market',f),cell('公車站','bus',f),cell('捷運站','mrt',f))+
   row(cell('火車站','train',f,{span:5}))+
   '<tr><td class="l">物件特色</td><td class="v spec" colspan="5" data-k="spec" contenteditable="false">'+esc(f.spec)+'</td></tr>'+
   '</tbody></table>'+
   '<div class="pics"><div class="pic map" data-img="mapUrl"><span class="tag">位置圖</span>'+mapImg+'</div>'+
   '<div class="pic plan" data-img="planUrl"><span class="tag">格局圖</span>'+planImg+'</div></div>'+
   '<div class="caption"><span>位置為示意，實際以現場為準。</span><span>本格局圖僅供參考使用，仍應以現場看屋結果為準。</span></div>'+
   '<div class="foot"><div><div class="brand">翔買鶴厝｜曾義翔</div><div class="co" data-k="store" contenteditable="false">'+esc(f.store)+'</div></div>'+
   '<div class="line">'+CTA_Q+'<br>'+CTA_A+'<small>'+LINE_URL.replace('https://','')+'</small></div></div>'+
  '</div>';
  $('#scaler').innerHTML=h;
  setEditing(editing);
  fit();
  $('#actions').hidden=false;
  // 物件特色過長時自動縮字，避免超出一頁
  shrinkSpec();
}

function shrinkSpec(){
  var sheet=$('#sheet');if(!sheet)return;
  var spec=sheet.querySelector('.spec'), pics=sheet.querySelector('.pics');
  var size=12.5;
  spec.style.fontSize='';
  while(pics.getBoundingClientRect().height/currentScale()<230&&size>9){size-=0.5;spec.style.fontSize=size+'px';spec.style.lineHeight='1.45'}
}
function currentScale(){var s=$('#scaler').style.transform.match(/scale\(([\d.]+)\)/);return s?+s[1]:1}

function fit(){
  var sc=$('#scaler');if(!sc.firstChild)return;
  var w=Math.min(window.innerWidth,document.documentElement.clientWidth)-16;
  var s=Math.min(1,w/794);
  sc.style.transform='scale('+s+')';
  sc.style.height=(1123*s)+'px';
  sc.style.marginLeft=s<1?'8px':'auto';
}
window.addEventListener('resize',fit);

function setEditing(on){
  editing=on;
  var sheet=$('#sheet');
  $('#edit').classList.toggle('on',on);
  $('#edit').textContent=on?'完成修改':'修改內容';
  $('#edithint').hidden=!on;
  if(!sheet)return;
  sheet.classList.toggle('editing',on);
  sheet.querySelectorAll('[data-k]').forEach(function(el){el.setAttribute('contenteditable',on?'true':'false')});
  if(!on)scrubPhones();
}
function scrubPhones(){
  var sheet=$('#sheet');if(!sheet)return;
  sheet.querySelectorAll('[data-k]').forEach(function(el){var t=noPhone(el.innerText);if(t!==el.innerText)el.innerText=t});
}

var pickTarget=null;
document.addEventListener('click',function(e){
  var p=e.target.closest&&e.target.closest('.pic');
  if(p&&editing){pickTarget=p;$('#imgfile').click();}
});
$('#imgfile').addEventListener('change',function(){
  var file=this.files[0];if(!file||!pickTarget)return;
  var rd=new FileReader();
  rd.onload=function(){
    var isMap=pickTarget.classList.contains('map');
    pickTarget.innerHTML='<span class="tag">'+(isMap?'位置圖':'格局圖')+'</span><img src="'+rd.result+'">';
    if(isMap)pickTarget.classList.remove('map');
  };
  rd.readAsDataURL(file);this.value='';
});

function status(msg,err){var s=$('#status');s.innerHTML=msg||'';s.className='status'+(err?' err':'')}

var FRIENDLY='抱歉，這個連結讀不到物件資料 🙏<br>請確認是物件分享連結（網址裡有 <b>ycut.com.tw/case-info/</b>），物件也可能已經下架。<br>需要協助的話，<a href="'+LINE_URL+'" target="_blank" rel="noopener">LINE@ @825gowqf</a> 傳連結給我，我幫你整理。<br><button type="button" class="blankbtn">或改用空白表格自己填</button>';

function load(input){
  var id=parseId(input);
  if(!id){status(FRIENDLY,true);return}
  status('讀取中，約需 5～15 秒，請稍等…');
  $('#go').disabled=true;
  fetchCase(id).then(function(d){
    var f=mapFields(d);
    if(f.mapUrl)return f;
    return osmMap(+d.googleMapLati,+d.googleMapLongi).then(function(u){f.mapUrl=u;return f});
  }).then(function(f){
    render(f);
    status('完成！可以存成圖片或 PDF。');
    try{history.replaceState(null,'','?id='+id)}catch(e){}
    setTimeout(function(){$('#stage').scrollIntoView({behavior:'smooth'})},100);
  }).catch(function(err){
    console.warn(err);status(FRIENDLY,true);
  }).then(function(){$('#go').disabled=false});
}

$('#form').addEventListener('submit',function(e){e.preventDefault();load($('#url').value.trim())});
$('#edit').addEventListener('click',function(){setEditing(!editing)});
document.addEventListener('click',function(e){if(e.target.classList&&e.target.classList.contains('blankbtn')){render(blankFields());setEditing(true);status('已開啟空白表格，點每一格填寫，填好按「完成修改」再存檔。')}});

function waitImages(root){
  return Promise.all(Array.prototype.map.call(root.querySelectorAll('img'),function(img){
    return img.complete?Promise.resolve():new Promise(function(r){img.onload=img.onerror=r});
  }));
}
function snapshot(){
  var sheet=$('#sheet');if(!sheet)return Promise.reject();
  var wasEditing=editing;setEditing(false);
  var sc=$('#scaler');var t=sc.style.transform;sc.style.transform='none';
  return (document.fonts?document.fonts.ready:Promise.resolve()).then(function(){return waitImages(sheet)}).then(function(){
    return html2canvas(sheet,{scale:2,useCORS:true,backgroundColor:'#fff',width:794,height:1123,windowWidth:900});
  }).then(function(c){sc.style.transform=t;if(wasEditing)setEditing(true);return c},
    function(e){sc.style.transform=t;throw e});
}
function fname(ext){return '售資_'+((current&&current.caseNo)||($('#sheet [data-k=caseNo]')||{}).innerText||'物件')+'.'+ext}
function saveBlob(blob,name){
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},2000);
}
$('#png').addEventListener('click',function(){
  status('圖片產生中…');
  snapshot().then(function(c){c.toBlob(function(b){saveBlob(b,fname('png'));status('圖片已下載。手機若沒看到，請到「下載」或「檔案」裡找。')},'image/png')})
  .catch(function(e){console.warn(e);status('圖片產生失敗，請改用 PDF 或重新整理再試一次。',true)});
});
$('#pdf').addEventListener('click',function(){
  status('PDF 產生中…');
  snapshot().then(function(c){
    var pdf=new jspdf.jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,297);
    pdf.link(0,280,210,17,{url:LINE_URL});
    saveBlob(pdf.output('blob'),fname('pdf'));
    status('PDF 已下載。');
  }).catch(function(e){console.warn(e);status('PDF 產生失敗，請重新整理再試一次。',true)});
});

// 支援 ?id=xxx 或 ?url=xxx 直接開啟
var q=new URLSearchParams(location.search);
var pre=q.get('url')||q.get('id');
if(pre){$('#url').value=pre.indexOf('http')===0?pre:'https://www.ycut.com.tw/case-info/'+pre;load(pre)}
})();
