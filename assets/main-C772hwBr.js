import"./style-Byydb-4h.js";const i=[{id:"fourier",title:"푸리에 급수",description:"사인파의 합성으로 임의의 주기 함수를 근사하는 원리를 에피사이클로 시각화합니다.",tags:["해석학","신호처리"],path:"concepts/fourier/"},{id:"group-rep",title:"유한군 표현론",description:"S_n, A_n, D_n, V₄의 실수·복소 기약표현을 시각화합니다. 생성원을 조합해 군 원소를 만들고, 벡터공간이 변환되는 모습을 격자 애니메이션으로 탐구합니다.",tags:["대수학","표현론","군론"],path:"concepts/group-rep/"}],s=document.getElementById("grid");i.forEach(t=>{const e=document.createElement("a");e.className="concept-card",e.href=t.path;const a=document.createElement("canvas");a.width=560,a.height=320;const n=document.createElement("div");n.className="concept-card-body",n.innerHTML=`
    <h2>${t.title}</h2>
    <p>${t.description}</p>
    <div class="concept-card-tags">
      ${t.tags.map(c=>`<span class="tag">${c}</span>`).join("")}
    </div>
  `,e.append(a,n),s.appendChild(e),t.thumbnail&&t.thumbnail(a)});
