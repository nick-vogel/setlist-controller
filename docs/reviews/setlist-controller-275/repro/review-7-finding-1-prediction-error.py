import re,sys,random
L=sys.argv[1]
tempo=None; playing=False; prev=None; errs=[]; steps=[]
for line in open(L):
    m=re.match(r'\s*([\d.]+) (\S+) \[(.*)\]',line)
    if not m: continue
    t=float(m.group(1)); addr=m.group(2); v=m.group(3)
    if addr.endswith('/tempo'): tempo=float(v)
    elif addr.endswith('/is_playing'): playing=(v=='True'); prev=None
    elif addr.endswith('/current_song_time'):
        p=float(v)
        if playing and prev and tempo:
            dt=t-prev[0]; dp=p-prev[1]
            if 0<dt<0.05 and 0<dp<0.1:
                pred=prev[1]+dt*tempo/60
                errs.append(pred-p); steps.append(dp)
        prev=(t,p)
n=len(errs); print('samples',n)
errs_s=sorted(errs); q=lambda f: errs_s[int(f*(n-1))]
print('pred-true beats: p1 %.4f p10 %.4f p50 %.4f p90 %.4f p99 %.4f'%(q(.01),q(.1),q(.5),q(.9),q(.99)))
print('mean step %.4f'%(sum(steps)/len(steps)))
# Monte Carlo: crossing overshoot eps uniform in [0, step]; a short prediction if err < -eps
random.seed(1); short=0; N=200000
for _ in range(N):
    i=random.randrange(n); eps=random.random()*steps[i]
    if errs[i] < -eps: short+=1
print('P(prediction short of the change) ~ %.3f'%(short/N))
