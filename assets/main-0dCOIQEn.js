import"./style-BPnD6B3e.js";const s=[{id:"fourier",title:"푸리에 급수",description:"사인파의 합성으로 임의의 주기 함수를 근사하는 원리를 에피사이클로 시각화합니다.",tags:["해석학","신호처리"],path:"concepts/fourier/"}],d=document.getElementById("grid");s.forEach(t=>{const a=document.createElement("a");a.className="concept-card",a.href=t.path;const e=document.createElement("canvas");e.width=560,e.height=320;const n=document.createElement("div");n.className="concept-card-body",n.innerHTML=`
    <h2>${t.title}</h2>
    <p>${t.description}</p>
    <div class="concept-card-tags">
      ${t.tags.map(c=>`<span class="tag">${c}</span>`).join("")}
    </div>
  `,a.append(e,n),d.appendChild(a),t.thumbnail&&t.thumbnail(e)});
