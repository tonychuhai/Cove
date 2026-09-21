"""Rebuild the lop in Blender, export the same geometry for the interactive room.

Run: Blender --background --python assets/blender/build_rabbit.py
All coat strands are real tapered geometry. No remote textures are required.
"""
import bpy, math, random, struct, json, bisect
from pathlib import Path
from mathutils import Vector, noise as noise3

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'scenes/bunny/assets'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(314159)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def b(v): return Vector((v[0], -v[2], v[1]))
def t(v): return (v[0], v[2], -v[1])
def linear(c): return c / 12.92 if c < .04045 else ((c+.055)/1.055)**2.4
def rgb(c): return tuple(linear(v) for v in c)
def mix(a,c,f): return tuple(x*(1-f)+y*f for x,y in zip(a,c))
def clamp(v): return max(0,min(1,v))
def smooth(a,c,v):
    q=clamp((v-a)/(c-a)); return q*q*(3-2*q)

materials={}
def material(name, color=(1,1,1), rough=.75, vertex=False, metallic=0):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*rgb(color),1); mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*rgb(color),1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metallic
    if vertex:
        attr=mat.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name='Coat'
        mat.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
    if name in ('coat','strands'):
        bs.inputs['Sheen Weight'].default_value=.23
        bs.inputs['Subsurface Weight'].default_value=.045
    materials[name]={'color':list(rgb(color)), 'roughness':rough, 'metalness':metallic,'vertexColors':vertex}
    return mat
coat=material('coat',vertex=True)
strand=material('strands',rough=.86,vertex=True)
eyeMat=material('eye',(.055,.032,.021),.095)
eyeMat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.65
rimMat=material('eyelid',(.25,.135,.091),.48)
noseMat=material('nose',(.43,.265,.20),.6)
whiskerMat=material('whisker',(.79,.73,.62),.6)
mouthMat=material('mouth',(.27,.16,.09),.76)
# Native Blender hair curves use the same per-strand coat colours as the export.
hairMaterial=bpy.data.materials.new('Groomed rabbit fur | native curves')
hairMaterial.use_nodes=True
nodes=hairMaterial.node_tree.nodes;nodes.clear()
hairOut=nodes.new('ShaderNodeOutputMaterial')
hairShader=nodes.new('ShaderNodeBsdfHairPrincipled');hairShader.parametrization='COLOR'
hairColor=nodes.new('ShaderNodeAttribute');hairColor.attribute_name='Coat'
hairMaterial.node_tree.links.new(hairColor.outputs['Color'],hairShader.inputs['Color'])
hairMaterial.node_tree.links.new(hairShader.outputs[0],hairOut.inputs['Surface'])
for key,value in [('Roughness',.33),('Radial Roughness',.38),('Coat',.1)]:
    if key in hairShader.inputs:hairShader.inputs[key].default_value=value


origins={'root':(0,0,0),'body':(0,0,0),'head':(0,.78,.3),
    'earL':(-.22,1.12,.32),'earR':(.22,1.12,.32),
    'eyeL':(-.19,.88,.66),'eyeR':(.19,.88,.66),'nose':(0,.81,.8),'arms':(0,.27,.30)}
parents={}
for name,p in origins.items():
    ob=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(ob); ob.location=b(p); parents[name]=ob
export=[]
def register(ob,parent,mat):
    origin=b(origins[parent]); ob.location-=origin; ob.parent=parents[parent]
    if len(ob.data.materials)==0: ob.data.materials.append(mat)
    ob['export_parent']=parent; ob['export_material']=mat.name; export.append(ob)
    for poly in ob.data.polygons: poly.use_smooth=True
    return ob

def ellipsoid(name,pos,scale,mat=coat,segments=40,rings=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=b(pos))
    ob=bpy.context.object; ob.name=name; ob.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    return ob

def fused(name,parts,parent,voxel=.014):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); ob=parts[0]; ob.name=name
    mod=ob.modifiers.new('Continuous anatomy','REMESH'); mod.mode='VOXEL'; mod.voxel_size=voxel; mod.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=ob.modifiers.new('Soft contours','SMOOTH'); mod.factor=1.1; mod.iterations=5
    bpy.ops.object.modifier_apply(modifier=mod.name)
    register(ob,parent,coat)
    return ob

def color_at(p,kind):
    x,y,z=p
    noise=noise3.noise(Vector((x*13,y*13,z*13)),noise_basis='PERLIN_ORIGINAL')*.045+noise3.noise(Vector((x*53,y*53,z*53)),noise_basis='PERLIN_ORIGINAL')*.018
    base=(.47+noise,.342+noise,.226+noise*.75)
    top=smooth(.25,1.15,y)
    base=mix(base,(.61+noise,.448+noise,.30+noise),top*.6)
    if kind=='body':
        belly=(1-smooth(.20+noise,.40+noise,y))*.7
        bib=smooth(.28,.48,z)*(1-smooth(.43+noise,.59+noise,y))*(1-smooth(.14,.24,abs(x)))*.8
        white=max(belly,bib)
    elif kind=='head':
        # Irregular cream muzzle and a narrow broken blaze, not a separate white ball.
        muzzle=smooth(.59,.69,z)*(1-smooth(.752+noise*.25,.811+noise*.25,y))
        cheek=smooth(.62,.72,z)*(1-smooth(.09,.19,abs(x)))*(1-smooth(.765+noise*.3,.807+noise*.3,y))*.65
        blaze=(1-smooth(.009,.029+noise*.3,abs(x)))*smooth(.63,.72,z)*(1-smooth(.85,.94,y))*.35
        white=max(muzzle,cheek,blaze)
    elif kind=='paw': white=(1-smooth(.065,.17,y))*.88
    elif kind=='tail': white=.98
    elif kind=='ear':
        white=0
        base=mix(base,(.48,.348,.272),.3)
    else: white=0
    return rgb(mix(base,(.92+noise,.869+noise,.766+noise),white))

def paint(ob,kind):
    bpy.context.view_layer.update()
    colors=ob.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    for vert,c in zip(ob.data.vertices,colors.data):
        p=t(ob.matrix_world@vert.co); c.color=(*color_at(p,kind),1)

def fur(ob,kind,count,length):
    bpy.context.view_layer.update(); ob.data.calc_loop_triangles()
    tris=list(ob.data.loop_triangles); cumulative=[]; total=0
    for tr in tris: total+=tr.area; cumulative.append(total)
    vs=[]; fs=[]; cs=[]; curvePoints=[]; curveColors=[]; curveRadii=[]
    origin=b(origins[ob['export_parent']])
    mat=ob.matrix_world.copy()
    for i in range(count):
        tri=tris[bisect.bisect_left(cumulative,random.random()*total)]
        a,c,d=[ob.data.vertices[v] for v in tri.vertices]
        u=math.sqrt(random.random()); v=random.random(); weights=(1-u,u*(1-v),u*v)
        p=a.co*weights[0]+c.co*weights[1]+d.co*weights[2]
        n=(a.normal*weights[0]+c.normal*weights[1]+d.normal*weights[2]).normalized()
        wp=mat@p; q=t(wp)
        if q[1]<.025: continue
        if kind=='head': groom=b((q[0]*.25,-.12,.6) if q[1]>.82 else (q[0]*2,-.25,.15))
        elif kind=='ear': groom=b((0,-1,-.12))
        else: groom=b((q[0]*.18,-.3,-.75))
        tangent=(groom-n*groom.dot(n)).normalized()
        disorder=b((random.uniform(-.10,.10),random.uniform(-.08,.08),random.uniform(-.10,.10)))
        direction=(n*.32+tangent*.95+disorder).normalized()
        le=length*(.65+random.random()*.65)
        if random.random()<.07: le*=1.8
        side=direction.cross(b((random.random(),random.random(),random.random()))).normalized()
        width=(.00042+random.random()*.00038)*(1 if kind!='ear' else .8)
        base=p+ob.location
        col=color_at(q,kind); variation=.65+random.random()*.65
        col=tuple(min(1,c*variation) for c in col)
        if random.random()<.10: col=tuple(c*.4 for c in col)
        start=len(vs)
        for j in range(4):
            f=j/3; center=base+direction*(le*f)+tangent*(le*.24*f*f)
            # Slightly longer curved guard fibres are retained in the Cycles groom.
            nativeCenter=base+direction*(le*f*1.6)+tangent*(le*.27*f*f)
            curvePoints.extend(nativeCenter)
            curveColors.extend((*mix(col,tuple(min(1,c*1.10) for c in col),f*.45),1))
            curveRadii.append(width*.55*(1-f)**.7+.000012)
            w=width*(1-f)*.5+.000005
            for s in [-1,1]:
                vs.append(center+side*w*s)
                cs.append((*mix(col,tuple(min(1,c*1.15+.008) for c in col),f*.65),1))
        for j in range(3):
            k=start+j*2; fs.extend([(k,k+1,k+2),(k+1,k+3,k+2)])
    mesh=bpy.data.meshes.new(ob.name+' fine coat'); mesh.from_pydata(vs,[],fs); mesh.update()
    hair=bpy.data.objects.new(ob.name+' | fine coat',mesh); bpy.context.collection.objects.link(hair)
    hair.location=origin; register(hair,ob['export_parent'],strand)
    ca=mesh.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    for item,col in zip(ca.data,cs): item.color=col
    curves=bpy.data.hair_curves.new(ob.name+' | groom')
    curves.add_curves([4]*(len(curveRadii)//4))
    curves.attributes['position'].data.foreach_set('vector',curvePoints)
    radii=curves.attributes.new('radius','FLOAT','POINT');radii.data.foreach_set('value',curveRadii)
    colors=curves.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    colors.data.foreach_set('color',curveColors)
    native=bpy.data.objects.new(ob.name+' | native groom',curves)
    bpy.context.collection.objects.link(native);native.parent=parents[ob['export_parent']]
    native.data.materials.append(hairMaterial)

body=fused('Continuous torso',[
    ellipsoid('torso',(0,.40,-.10),(.37,.295,.64)),
    ellipsoid('powerful haunches',(0,.43,-.35),(.435,.39,.40)),
    ellipsoid('shoulder',(0,.43,.23),(.275,.29,.30)),
    ellipsoid('throat',(0,.605,.435),(.18,.17,.20)),
], 'body')
paint(body,'body'); fur(body,'body',42000,.030)
head=fused('Sculpted face',[
    ellipsoid('skull',(0,.835,.42),(.265,.223,.278)),
    ellipsoid('cheek L',(-.075,.748,.682),(.092,.072,.102)),
    ellipsoid('cheek R',(.075,.748,.682),(.092,.072,.102)),
    ellipsoid('nasal bridge',(0,.807,.638),(.099,.090,.15)),
    ellipsoid('chin',(0,.70,.677),(.105,.043,.085)),
], 'head',.0085)
paint(head,'head'); fur(head,'head',32000,.013)
for side,parent in [(-1,'earL'),(1,'earR')]:
    verts=[]; faces=[]
    rows,around=42,28
    for i in range(rows+1):
        f=i/rows
        center=(side*(.17+.15*math.sin(f*math.pi*.55)),1.012-(.63+side*.018)*f,.32+.10*math.sin(f*math.pi)+(.055+side*.028)*f)
        width=.020+.086*math.sin(math.pi*f)**.60
        if i==rows: width=.0015
        depth=(.014+.011*math.sin(math.pi*f))*(1-smooth(.85,1,f))+.001
        for j in range(around):
            a=j/around*math.tau
            verts.append(b((center[0]+math.cos(a)*width,center[1],center[2]+math.sin(a)*depth)))
        if i:
            for j in range(around):
                a=(i-1)*around+j;c=(i-1)*around+(j+1)%around; d=i*around+(j+1)%around;e=i*around+j
                faces.append((a,c,d,e))
    me=bpy.data.meshes.new('lop ear');me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new('Left ear' if side<0 else 'Right ear',me);bpy.context.collection.objects.link(ob)
    register(ob,parent,coat); paint(ob,'ear'); fur(ob,'ear',6500,.013)

for side in [-1,1]:
    paw=fused('Foreleg and paw',[
        ellipsoid('Foreleg',(side*.16,.17,.35),(.075,.13,.09)),
        ellipsoid('Front paw',(side*.16,.058,.455+side*.018),(.082,.055,.163)),
    ],'arms',.009)
    paint(paw,'paw');fur(paw,'paw',2300,.014)
    foot=ellipsoid('Hind foot',(side*.29,.073,-.17),(.144,.078,.247))
    register(foot,'body',coat);paint(foot,'paw');fur(foot,'paw',1800,.018)
tail=ellipsoid('Cotton tail',(0,.43,-.77),(.14,.15,.14))
register(tail,'body',coat);paint(tail,'tail');fur(tail,'tail',2200,.03)

def tube(name,pts,radii,mat,parent,sides=6):
    verts=[]; faces=[]
    for i,p in enumerate(pts):
        p=b(p); before=b(pts[max(0,i-1)]);after=b(pts[min(len(pts)-1,i+1)])
        direction=(after-before).normalized(); s=direction.cross(Vector((0,0,1)))
        if s.length<.01:s=direction.cross(Vector((1,0,0)))
        s.normalize();other=direction.cross(s).normalized()
        for j in range(sides):
            a=j/sides*math.tau;verts.append(p+(s*math.cos(a)+other*math.sin(a))*radii[i])
        if i:
            for j in range(sides): faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
    register(ob,parent,mat);return ob

for side,parent in [(-1,'eyeL'),(1,'eyeR')]:
    eye=ellipsoid('Glossy brown eye', (side*.235,.866,.536),(.030,.035,.020),eyeMat,40,28)
    eye.rotation_euler.z=side*.9
    bpy.context.view_layer.objects.active=eye
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    register(eye,parent,eyeMat)
    pts=[]
    for i in range(49):
        a=i/48*math.tau
        pts.append((side*.235+math.cos(a)*.0305*.622,.866+math.sin(a)*.0355,.536-math.cos(a)*.0305*side*.783))
    tube('Fine eyelid',pts,[.0015]*len(pts),rimMat,'head')

# An inverted heart shaped rabbit nose and delicate philtrum.
no=ellipsoid('Velvet nose',(0,.793,.790),(.024,.017,.014),noseMat,32,20)
for v in no.data.vertices:
    ny=v.co.z/.017
    v.co.x*=.55+.45*smooth(-1,1,ny)
    if ny>.65 and abs(v.co.x)<.009: v.co.z-=.003
register(no,'nose',noseMat)
tube('Philtrum',[(0,.779,.789),(0,.763,.782),(0,.752,.774)],[.0015,.0012,.0008],mouthMat,'head')
for side in [-1,1]:
    tube('Mouth corner',[(0,.752,.774),(side*.017,.747,.772),(side*.029,.75,.767)],[.0008,.001,.0005],mouthMat,'head')
    for i in range(9):
        start=(side*(.09+random.random()*.025),.751+(random.random()-.5)*.06,.766)
        end=(side*(.30+random.random()*.13),start[1]+(i-4)*.025,.785-random.random()*.035)
        pts=[]
        for j in range(9):
            f=j/8;pts.append((start[0]*(1-f)+end[0]*f,start[1]*(1-f)+end[1]*f+.022*math.sin(f*math.pi),start[2]*(1-f)+end[2]*f+.035*math.sin(f*math.pi)))
        tube('Tapered whisker',pts,[.00075*(1-j/9)**.8 for j in range(9)],whiskerMat,'head',4)

# Export evaluated Blender meshes into a compact, documented binary geometry asset.
bpy.context.view_layer.update()
manifest={'version':1,'buffers':'rabbit.bin','generator':'Blender '+bpy.app.version_string,'meshes':[],'materials':materials}
blob=bytearray()
def pack(values,kind):
    offset=len(blob); blob.extend(struct.pack('<'+kind*len(values),*values)); return {'offset':offset,'count':len(values)}
for ob in export:
    me=ob.data;me.calc_loop_triangles()
    positions=[];normals=[];colors=[]
    for v in me.vertices:
        positions.extend(t(v.co));normals.extend(t(v.normal))
    ca=me.color_attributes.get('Coat')
    if ca:
        for c in ca.data:colors.extend(c.color[:3])
    indices=[v for tr in me.loop_triangles for v in tr.vertices]
    entry={'name':ob.name,'parent':ob['export_parent'],'position':t(ob.location),'material':ob['export_material'],
        'positions':pack(positions,'f'),'normals':pack(normals,'f'),'indices':pack(indices,'I')}
    if colors:entry['colors']=pack(colors,'f')
    manifest['meshes'].append(entry)
(OUT/'rabbit.bin').write_bytes(blob)
(OUT/'rabbit.json').write_text(json.dumps(manifest,separators=(',',':')))
print('EXPORTED',len(export),'meshes',len(blob),'bytes',flush=True)

# The native curves and the lighter tapered mesh coat share a groom. Only the
# curves render in Cycles; only the triangle coat is exported for the live app.
for ob in export:
    if ob['export_material']=='strands': ob.hide_render=True

# A reviewable Blender portrait, with the same mesh and vertex colours as the app.
def simplemat(name,c,rough=.7):return material(name,c,rough)
floorMat=simplemat('Porcelain oak',(.73,.70,.65),.42)
wallMat=simplemat('Blue limewash',(.39,.48,.59),.9)
def plane(name,verts,mat):
    me=bpy.data.meshes.new(name);me.from_pydata([b(v) for v in verts],[],[(0,1,2,3)]);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
plane('Floor',[(-200,0,200),(200,0,200),(200,0,-200),(-200,0,-200)],floorMat)
plane('Backdrop',[(-20,0,-3),(20,0,-3),(20,20,-3),(-20,20,-3)],wallMat)
def area(name,pos,target,power,size,c):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=c
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=b(pos);ob.rotation_euler=(b(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('Warm window',(3,4,2),(0,.5,0),420,3,(1,.78,.56))
area('Cool room bounce',(-3,2,2),(0,.5,0),110,4,(.65,.78,1))
area('Soft rim',(1,2,-2),(0,.6,0),240,2,(1,.87,.68))
cam=bpy.data.cameras.new('Portrait camera');camera=bpy.data.objects.new('Portrait camera',cam);bpy.context.collection.objects.link(camera)
camera.location=b((2.5,.85,3.2));target=b((0,.52,.08));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();cam.lens=64
cam.dof.use_dof=True;cam.dof.focus_distance=(target-camera.location).length;cam.dof.aperture_fstop=7.1
scene=bpy.context.scene;scene.camera=camera
scene.world.color=(.15,.15,.15)
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'assets/blender/rabbit-portrait.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/rabbit-realistic.blend'),compress=True)
bpy.ops.render.render(write_still=True)
