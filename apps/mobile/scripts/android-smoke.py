from pathlib import Path
import subprocess,xml.etree.ElementTree as ET,re,time,json,os
if os.environ.get('WELLQ_SYNTHETIC_TESTS')!='1':raise RuntimeError('Set WELLQ_SYNTHETIC_TESTS=1; use only the synthetic seed and disposable API')
sdk=os.environ.get('ANDROID_HOME',str(Path(os.environ.get('LOCALAPPDATA',''))/'Android/Sdk'))
adb=str(Path(sdk)/'platform-tools/adb.exe') if os.name=='nt' else 'adb'
base=[adb,'-s',os.environ.get('ANDROID_SERIAL','emulator-5580')]
output=Path(__file__).resolve().parents[1]/'evidence'
output.mkdir(exist_ok=True)
def run(*args):return subprocess.check_output(base+list(args),encoding='utf-8',errors='replace').strip()
def ui():
 run('shell','uiautomator','dump','/sdcard/wellq-ui.xml')
 return ET.fromstring(run('shell','cat','/sdcard/wellq-ui.xml'))
def node(label,editable=False):
 for attempt in range(3):
  for el in ui().iter('node'):
   if (el.get('content-desc')==label or el.get('text')==label) and (not editable or el.get('class')=='android.widget.EditText'):
    _,top,_,bottom=map(int,re.findall(r'\d+',el.get('bounds')))
    if bottom-top>=35:return el
  run('shell','input','swipe','540','1600','540','800','250')
 raise RuntimeError('No se encontro el control '+label)
def tap(el):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',el.get('bounds')));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def fill(label,value):
 el=node(label,True);tap(el);run('shell','input','keyevent','123');run('shell','input','keyevent',*(['67']*max(40,len(el.get('text','')))))
 run('shell','input','text',value.replace(' ','%s'));run('shell','input','keyevent','4')
def wait_text(text):
 for _ in range(12):
  tree=ui()
  if any(text in el.get('text','') for el in tree.iter('node')):return tree
  time.sleep(0.25)
 raise RuntimeError('No aparecio '+text)
def capture(name):
 pixels=subprocess.check_output(base+['exec-out','screencap','-p']);(output/f'{name}.png').write_bytes(pixels)
wait_text('Bienvenido a WellQ');capture('login')
print('Login visible',flush=True)
fill('Correo electr\u00f3nico','patient1@example.com');fill('Contrase\u00f1a','Demo1234!');tap(node('Iniciar sesi\u00f3n'))
tree=wait_text('Elige tu cl\u00ednica');capture('clinics');print('Seleccion de clinicas OK',flush=True)
choices=[el for el in tree.iter('node') if el.get('content-desc')=='Continuar'];assert len(choices)==2,'Se esperan dos clinicas autorizadas'
tap(choices[0]);wait_text('Hola,');capture('welcome');print('Bienvenida OK',flush=True)
run('shell','am','force-stop','com.wellq.capstone');run('shell','am','start','-n','com.wellq.capstone/.MainActivity')
wait_text('Hola,');capture('restored');print('Restauracion sin credenciales OK',flush=True)
tap(node('Mi cuenta'));tap(node('Cerrar sesi\u00f3n'));wait_text('Bienvenido a WellQ')
# On smaller viewports the recovery link may require a short scroll.
try:control=node('Olvid\u00e9 mi contrase\u00f1a')
except RuntimeError:
 run('shell','input','swipe','540','1600','540','1000','250');control=node('Olvid\u00e9 mi contrase\u00f1a')
tap(control);wait_text('Recupera tu acceso'.upper());capture('recovery')
(output/'android-smoke.json').write_text(json.dumps({'device':'Android 15 emulator x86_64','realApiPort':3101,'login':True,'twoAuthorizedClinics':True,'welcome':True,'restartRestoresWithoutCredentials':True,'logout':True,'recoveryScreen':True},indent=2),encoding='utf-8')
print('Emulador Android: login, seleccion de dos clinicas, bienvenida, restauracion y logout OK')
