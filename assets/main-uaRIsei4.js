import"./style-elFVMjQj.js";const p=[{id:"fourier",title:"Fourier Series",description:"Visualize a relation between periodic functions and its Fourier coefficients.",tags:["Analysis"],path:"concepts/fourier/"},{id:"group-rep",title:"Finite Group Representations",description:"Visualize real irreducible representations of small groups. Compose group elements from generators and explore how they act on vector spaces.",tags:["Representation Theory"],path:"concepts/group-rep/"},{id:"lie-algebra",title:"Lie Algebra — Commutator",description:"Watch the group commutator exp(tX)exp(tY)exp(-tX)exp(-tY) converge to exp(t²[X,Y]) as t→0, step by step on GL₂(ℝ).",tags:["Lie Theory"],path:"concepts/lie-algebra/"}],m=document.getElementById("grid");p.forEach((e,c)=>{const i=c===0,d=i?"bento-card--featured":"bento-card--secondary",t=document.createElement("a");t.className=`bento-card glass-panel ${d}`,t.href=e.path;const a=document.createElement("canvas");a.width=560,a.height=i?180:120;const s=document.createElement("div");s.className="bento-card__header",s.innerHTML=`
    <span class="bento-tag">${e.tags[0]??""}</span>
    <h2 class="bento-card__title">${e.title}</h2>
  `;const n=document.createElement("div");n.className="bento-card__thumb",n.appendChild(a);const o=document.createElement("p");o.className="bento-card__desc",o.textContent=e.description;const r=document.createElement("div");r.className="bento-card__footer",r.innerHTML=`
    <div class="bento-card__tags">
      ${e.tags.map(l=>`<span class="tag">${l}</span>`).join("")}
    </div>
    <span class="btn-launch">Launch →</span>
  `,t.append(s,n,o,r),m.appendChild(t),e.thumbnail&&e.thumbnail(a)});
