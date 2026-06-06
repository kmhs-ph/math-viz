import"./style-BkIbOE3j.js";const n=[{id:"fourier",title:"Fourier Series",description:"Visualize how arbitrary periodic functions are approximated by sums of sine waves, using rotating epicycles.",tags:["Analysis","Signal Processing"],path:"concepts/fourier/"},{id:"group-rep",title:"Finite Group Representations",description:"Visualize real and complex irreducible representations of S_n, A_n, D_n, V₄. Compose group elements from generators and explore how they act on vector spaces.",tags:["Algebra","Representation Theory","Group Theory"],path:"concepts/group-rep/"}],s=document.getElementById("grid");n.forEach(e=>{const t=document.createElement("a");t.className="concept-card",t.href=e.path;const a=document.createElement("canvas");a.width=560,a.height=320;const r=document.createElement("div");r.className="concept-card-body",r.innerHTML=`
    <h2>${e.title}</h2>
    <p>${e.description}</p>
    <div class="concept-card-tags">
      ${e.tags.map(i=>`<span class="tag">${i}</span>`).join("")}
    </div>
  `,t.append(a,r),s.appendChild(t),e.thumbnail&&e.thumbnail(a)});
