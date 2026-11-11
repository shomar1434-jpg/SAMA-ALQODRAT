import re,sys
import os
d=os.path.dirname(os.path.abspath(__file__))+'/'
h=open(d+'index.html').read()
css=open(d+'src/style.css').read()
h=re.sub(r'<style>[\s\S]*?</style>', lambda m:'<style>\n'+css+'\n</style>', h, count=1)
u='\n'.join(l for l in open(d+'src/utils.js').read().split('\n') if not l.startswith('function toast('))
parts=[u]+[open(d+'src/'+f).read() for f in ['catalog.js','logos.js','partners.js','data2.js','views2_head.js','views2_main.js','landing.js','features.js','views2_admin.js','print.js','views2_programs.js','views2_settings.js']]
i=h.index('const LOGO = "'); j=h.index('";',i)+2
k=h.index('</script>', j)
h=h[:j]+'\n'+'\n'.join(parts)+'\n'+h[k:]
open(d+'index.html','w').write(h)
print(len(h))
