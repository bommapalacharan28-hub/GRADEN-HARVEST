import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput,
  View, useColorScheme
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CATEGORIES = ['Fruit', 'Leafy', 'Root', 'Other'];
const NAV = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'records', label: 'Records', icon: '▤' },
  { key: 'add', label: 'Add', icon: '+' },
  { key: 'insights', label: 'Insights', icon: '▥' },
  { key: 'settings', label: 'More', icon: '•••' },
];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const isValidISODate = value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value; };
const money = n => `${Number(n || 0).toFixed(2).replace(/\.00$/, '')} kg`;
const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
function parseCsvLine(line) {
  const out=[]; let value='', quoted=false;
  for(let i=0;i<line.length;i++) {
    const ch=line[i];
    if(ch==='"' && quoted && line[i+1]==='"'){value+='"';i++;}
    else if(ch==='"') quoted=!quoted;
    else if(ch===',' && !quoted){out.push(value);value='';}
    else value+=ch;
  }
  out.push(value); return out;
}
function startOfWeek(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const PALETTES = {
  light: { bg:'#F5F7F1', surface:'#FFFFFF', surface2:'#EDF4EB', ink:'#21352A', muted:'#718078', line:'#E1E9DF', forest:'#153F2E', green:'#28734D', leaf:'#70A96B', danger:'#B94C43', warning:'#FFF4D9', gold:'#9B711E' },
  dark: { bg:'#101B15', surface:'#19271F', surface2:'#24372B', ink:'#EAF2EA', muted:'#A3B4A7', line:'#304437', forest:'#B9D9BE', green:'#78B88A', leaf:'#8DC58A', danger:'#FF8D80', warning:'#493A1B', gold:'#F0C66C' }
};

export default function App() {
  const systemScheme = useColorScheme();
  const [themeChoice, setThemeChoice] = useState('system');
  const dark = themeChoice === 'dark' || (themeChoice === 'system' && systemScheme === 'dark');
  const c = dark ? PALETTES.dark : PALETTES.light;
  const [db, setDb] = useState(null);
  const [records, setRecords] = useState([]);
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [weekDate, setWeekDate] = useState(todayISO());
  const [crop, setCrop] = useState('');
  const [category, setCategory] = useState('');
  const [qty, setQty] = useState('');
  const [harvestDate, setHarvestDate] = useState(todayISO());
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [introDone, setIntroDone] = useState(true);

  useEffect(() => {
    let unsubscribe;
    (async () => {
      try {
        const storedTheme = await AsyncStorage.getItem('ghr-theme');
        if (storedTheme) setThemeChoice(storedTheme);
        const seen = await AsyncStorage.getItem('ghr-onboarded');
        setIntroDone(seen === 'yes');
        const database = await SQLite.openDatabaseAsync('garden-harvest.db');
        await database.execAsync(`PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS harvests (
            id TEXT PRIMARY KEY NOT NULL,
            date TEXT NOT NULL,
            crop TEXT NOT NULL,
            category TEXT NOT NULL,
            qty REAL NOT NULL CHECK(qty > 0 AND qty <= 1000),
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_harvest_date ON harvests(date);
          CREATE INDEX IF NOT EXISTS idx_harvest_crop ON harvests(crop);`);
        setDb(database);
        const rows = await database.getAllAsync('SELECT * FROM harvests ORDER BY date DESC, created_at DESC');
        setRecords(rows);
      } catch (e) {
        Alert.alert('Could not open local database', String(e?.message || e));
      } finally { setLoading(false); }
    })();
    unsubscribe = NetInfo.addEventListener(state => setOnline(!!state.isConnected));
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const refresh = async (database=db) => {
    if (!database) return;
    const rows = await database.getAllAsync('SELECT * FROM harvests ORDER BY date DESC, created_at DESC');
    setRecords(rows);
  };
  const notify = message => Alert.alert('Garden Harvest Register', message);
  const total = records.reduce((s,r)=>s+Number(r.qty),0);
  const cropTotals = useMemo(() => records.reduce((o,r)=>{o[r.crop]=(o[r.crop]||0)+Number(r.qty);return o;},{}),[records]);
  const topCrop = Object.entries(cropTotals).sort((a,b)=>b[1]-a[1])[0];
  const filtered = records.filter(r => {
    const q=search.trim().toLowerCase();
    return (!q || r.crop.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) && (filter==='All' || r.category===filter);
  });
  const weekStart = startOfWeek(weekDate);
  const weekEndDate = new Date(`${weekStart}T12:00:00`); weekEndDate.setDate(weekEndDate.getDate()+6);
  const weekEnd = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth()+1).padStart(2,'0')}-${String(weekEndDate.getDate()).padStart(2,'0')}`;
  const weekRecords = records.filter(r=>r.date>=weekStart && r.date<=weekEnd);
  const weekGroups = weekRecords.reduce((o,r)=>{o[r.crop]=(o[r.crop]||0)+Number(r.qty);return o;},{});
  const weekTotal = weekRecords.reduce((s,r)=>s+Number(r.qty),0);
  const fruitTotal = records.filter(r=>r.category==='Fruit').reduce((s,r)=>s+Number(r.qty),0);
  const leafyTotal = records.filter(r=>r.category==='Leafy').reduce((s,r)=>s+Number(r.qty),0);
  const highest = records.length ? Math.max(...records.map(r=>Number(r.qty))) : 0;
  const lowest = records.length ? Math.min(...records.map(r=>Number(r.qty))) : 0;
  const unusual = records.filter(r=>Number(r.qty)>500).length;

  const addRecord = async () => {
    const name=crop.trim().replace(/\s+/g,' '), amount=Number(qty);
    if (!name || name.length>45) return notify('Enter a crop name between 1 and 45 characters.');
    if (!CATEGORIES.includes(category)) return notify('Choose a harvest category.');
    if (!Number.isFinite(amount) || amount<=0 || amount>1000) return notify('Quantity must be greater than 0 and no more than 1,000 kg.');
    if (!isValidISODate(harvestDate)) return notify('Enter a valid harvest date in YYYY-MM-DD format.');
    try {
      setBusy(true);
      await db.runAsync('INSERT INTO harvests (id,date,crop,category,qty,created_at) VALUES (?,?,?,?,?,?)',uid(),harvestDate,name,category,amount,new Date().toISOString());
      await refresh(); setCrop('');setCategory('');setQty('');setHarvestDate(todayISO());setTab('records');
      notify('Harvest record saved on this device.');
    } catch(e) { notify(`Could not save record: ${e.message}`); }
    finally { setBusy(false); }
  };
  const removeRecord = id => Alert.alert('Delete harvest?', 'This record will be permanently removed from this device.', [
    {text:'Cancel',style:'cancel'}, {text:'Delete',style:'destructive',onPress:async()=>{await db.runAsync('DELETE FROM harvests WHERE id=?',id);await refresh();}}
  ]);
  const beginEdit = r => {setEditRecord(r);setEditForm({crop:r.crop,category:r.category,qty:String(r.qty),date:r.date});};
  const saveEdit = async () => {
    const name=String(editForm.crop||'').trim(), amount=Number(editForm.qty);
    if(!name || name.length>45 || !CATEGORIES.includes(editForm.category) || !Number.isFinite(amount) || amount<=0 || amount>1000 || !isValidISODate(editForm.date)) return notify('Please check the crop, category, quantity and date.');
    await db.runAsync('UPDATE harvests SET crop=?,category=?,qty=?,date=? WHERE id=?',name,editForm.category,amount,editForm.date,editRecord.id);
    setEditRecord(null);await refresh();
  };
  const addDemo = () => Alert.alert('Load demo data?', 'Add 40 sample harvest records to your current register?', [
    {text:'Cancel',style:'cancel'}, {text:'Add 40 records',onPress:async()=>{
      const crops=[['Tomato','Fruit'],['Spinach','Leafy'],['Carrot','Root'],['Cucumber','Fruit'],['Lettuce','Leafy'],['Radish','Root'],['Pumpkin','Fruit'],['Beans','Other'],['Kale','Leafy'],['Beetroot','Root']];
      const batch=[];for(let i=0;i<40;i++){const d=new Date();d.setDate(d.getDate()-((i*3)%28));const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const [n,cat]=crops[i%10];batch.push([`demo-${uid()}`,ds,n,cat,[2.5,4,6.75,1.2,8.5,3.25,5][i%7],new Date().toISOString()]);}
      await db.withTransactionAsync(async()=>{for(const row of batch)await db.runAsync('INSERT INTO harvests (id,date,crop,category,qty,created_at) VALUES (?,?,?,?,?,?)',...row);});await refresh();notify('40 demo records added.');
    }}
  ]);
  const shareFile = async (filename, content, mime='text/plain') => {
    try {
      setBusy(true);
      const uri=FileSystem.cacheDirectory+filename;
      await FileSystem.writeAsStringAsync(uri,content,{encoding:FileSystem.EncodingType.UTF8});
      if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:mime,dialogTitle:'Export Garden Harvest Register'});
      else notify(`File created at ${uri}`);
    } catch(e){notify(`Export failed: ${e.message}`);} finally {setBusy(false);}
  };
  const exportCsv = () => shareFile('garden_harvest_records.csv',[['date','crop','category','quantity_kg'],...records.map(r=>[r.date,r.crop,r.category,r.qty])].map(row=>row.map(escapeCsv).join(',')).join('\n'),'text/csv');
  const exportJson = () => shareFile('garden_harvest_records.json',JSON.stringify(records.map(({id,date,crop,category,qty})=>({id,date,crop,category,qty})),null,2),'application/json');
  const reportText = () => ['GARDEN HARVEST REGISTER','=======================',`Generated: ${new Date().toLocaleString()}`,`Records: ${records.length}`,`Total harvest: ${money(total)}`,'','DATE | CROP | CATEGORY | QUANTITY',...records.map(r=>`${r.date} | ${r.crop} | ${r.category} | ${money(r.qty)}`),'','WEEKLY TOTALS',...Object.entries(records.reduce((o,r)=>{const w=startOfWeek(r.date);o[w]=(o[w]||0)+Number(r.qty);return o;},{})).sort().map(([w,v])=>`${w}: ${money(v)}`)].join('\n');
  const exportTxt = () => shareFile('garden_harvest_summary.txt',reportText(),'text/plain');
  const exportMd = () => shareFile('garden_harvest_summary.md',`# Garden Harvest Register\n\n- Generated: ${new Date().toLocaleString()}\n- Records: ${records.length}\n- Total harvest: ${money(total)}\n- Average per entry: ${money(records.length?total/records.length:0)}\n\n| Date | Crop | Category | Quantity |\n|---|---|---|---:|\n${records.map(r=>`| ${r.date} | ${r.crop.replace(/\|/g,'\\|')} | ${r.category} | ${money(r.qty)} |`).join('\n')}`,'text/markdown');
  const importCsv = async () => {
    try {
      const pick=await DocumentPicker.getDocumentAsync({type:['text/csv','text/comma-separated-values','public.comma-separated-values-text'],copyToCacheDirectory:true});
      if(pick.canceled) return;
      setBusy(true);
      const text=await FileSystem.readAsStringAsync(pick.assets[0].uri);
      const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
      if(lines.length<2) throw new Error('The CSV file has no data rows.');
      const headers=parseCsvLine(lines.shift()).map(x=>x.trim().toLowerCase());
      const index={date:headers.indexOf('date'),crop:headers.indexOf('crop')>=0?headers.indexOf('crop'):headers.indexOf('vegetable'),category:headers.indexOf('category'),qty:headers.findIndex(x=>['quantity_kg','quantity','qty'].includes(x))};
      if(Object.values(index).some(x=>x<0)) throw new Error('CSV headers must include date, crop (or vegetable), category and quantity/quantity_kg.');
      let added=0, skipped=0;
      await db.withTransactionAsync(async()=>{
        for(const line of lines){const cols=parseCsvLine(line);const d=(cols[index.date]||'').trim(),name=(cols[index.crop]||'').trim(),cat=(cols[index.category]||'').trim(),amount=Number(cols[index.qty]);
          const validDate=isValidISODate(d);
          if(!validDate||!name||name.length>45||!CATEGORIES.includes(cat)||!Number.isFinite(amount)||amount<=0||amount>1000){skipped++;continue;}
          await db.runAsync('INSERT INTO harvests (id,date,crop,category,qty,created_at) VALUES (?,?,?,?,?,?)',uid(),d,name,cat,amount,new Date().toISOString());added++;
        }
      });
      await refresh();notify(`Import complete. Added ${added} row(s); skipped ${skipped} invalid row(s).`);
    } catch(e){notify(`CSV import failed: ${e.message}`);} finally {setBusy(false);}
  };
  const importJson = async () => {
    try {
      const pick=await DocumentPicker.getDocumentAsync({type:['application/json','text/json'],copyToCacheDirectory:true});
      if(pick.canceled) return;
      setBusy(true);
      const raw=await FileSystem.readAsStringAsync(pick.assets[0].uri);
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error('JSON must contain an array of harvest records.');
      let added=0,skipped=0;
      await db.withTransactionAsync(async()=>{
        for(const row of parsed){
          const d=String(row.date||''),name=String(row.crop||row.vegetable||'').trim(),cat=String(row.category||''),amount=Number(row.qty ?? row.quantity_kg ?? row.quantity);
          const validDate=isValidISODate(d);
          if(!validDate||!name||name.length>45||!CATEGORIES.includes(cat)||!Number.isFinite(amount)||amount<=0||amount>1000){skipped++;continue;}
          await db.runAsync('INSERT INTO harvests (id,date,crop,category,qty,created_at) VALUES (?,?,?,?,?,?)',uid(),d,name,cat,amount,new Date().toISOString());added++;
        }
      });
      await refresh();notify(`JSON import complete. Added ${added} row(s); skipped ${skipped} invalid row(s).`);
    } catch(e){notify(`JSON import failed: ${e.message}`);} finally {setBusy(false);}
  };
  const clearAll = () => Alert.alert('Clear all harvest records?', 'This permanently deletes all records stored in this app.', [
    {text:'Cancel',style:'cancel'}, {text:'Delete all',style:'destructive',onPress:async()=>{await db.runAsync('DELETE FROM harvests');await refresh();}}
  ]);
  const setTheme = async value => {setThemeChoice(value);await AsyncStorage.setItem('ghr-theme',value);};
  const finishIntro = async () => {await AsyncStorage.setItem('ghr-onboarded','yes');setIntroDone(true);};

  const styles = makeStyles(c);
  const Card = ({children, style}) => <View style={[styles.card,style]}>{children}</View>;
  const Button = ({title,onPress,kind='primary',small=false,disabled=false}) => <Pressable disabled={disabled||busy} onPress={onPress} style={({pressed})=>[styles.button,kind==='soft'&&styles.buttonSoft,kind==='danger'&&styles.buttonDanger,small&&styles.buttonSmall,(pressed||disabled)&&{opacity:.65}]}><Text style={[styles.buttonText,kind!=='primary'&&{color:kind==='danger'?c.danger:c.green},small&&{fontSize:12}]}>{title}</Text></Pressable>;
  const Field = ({label,value,onChangeText,placeholder,keyboardType='default',maxLength}) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} maxLength={maxLength} style={styles.input}/></View>;
  const Chip = ({label,selected,onPress}) => <Pressable onPress={onPress} style={[styles.chip,selected&&styles.chipSelected]}><Text style={[styles.chipText,selected&&{color:'#fff'}]}>{label}</Text></Pressable>;
  const Metric = ({label,value,caption}) => <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text>{caption?<Text style={styles.metricCaption}>{caption}</Text>:null}</View>;

  const renderRecord = ({item}) => <Card style={styles.recordCard}><View style={{flex:1}}><Text style={styles.recordCrop}>{item.crop}</Text><Text style={styles.mutedText}>{item.date}  ·  {item.category}</Text><Text style={styles.recordQty}>{money(item.qty)}</Text></View><View style={styles.recordActions}><Pressable onPress={()=>beginEdit(item)} style={styles.iconButton}><Text style={styles.iconButtonText}>Edit</Text></Pressable><Pressable onPress={()=>removeRecord(item.id)} style={[styles.iconButton,{backgroundColor:dark?'#422B2B':'#FFF0ED'}]}><Text style={[styles.iconButtonText,{color:c.danger}]}>Delete</Text></Pressable></View></Card>;

  const HomeScreen = () => <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><View style={styles.heroIcon}><Text style={{fontSize:27}}>🌱</Text></View><View style={{flex:1}}><Text style={styles.heroEyebrow}>EVERYDAY INNOVATORS · PROJECT #67</Text><Text style={styles.heroTitle}>Your garden,{ '\n'}in clear numbers.</Text><Text style={styles.heroSub}>Record · Track · Grow</Text></View></View>
    {!online&&<View style={styles.offline}><Text style={{color:c.gold,fontWeight:'700'}}>Offline mode · Your records are saved on this device.</Text></View>}
    {unusual>0&&<View style={styles.warning}><Text style={{color:c.gold,fontWeight:'700'}}>⚠ {unusual} unusually large record(s) above 500 kg. Please review them.</Text></View>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Garden overview</Text><Text style={styles.mutedText}>All-time performance</Text></View>
    <View style={styles.metricsGrid}><Metric label="TOTAL HARVEST" value={money(total)} caption="All records"/><Metric label="ENTRIES" value={String(records.length)} caption="Saved harvests"/><Metric label="AVERAGE / ENTRY" value={money(records.length?total/records.length:0)} caption="Mean quantity"/><Metric label="TOP CROP" value={topCrop?.[0]||'—'} caption={topCrop?money(topCrop[1]):'No data yet'}/></View>
    <View style={styles.quickRow}><Text style={styles.sectionTitle}>Quick actions</Text><Button title="＋ Add harvest" onPress={()=>setTab('add')}/></View>
    <Card><Text style={styles.cardTitle}>This week</Text><Text style={styles.bigNumber}>{money(weekTotal)}</Text><Text style={styles.mutedText}>{weekStart} to {weekEnd}</Text><View style={{marginTop:14}}>{Object.entries(weekGroups).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,val])=><View key={name} style={styles.barRow}><View style={{flex:1}}><Text style={styles.bodyText}>{name}</Text><View style={styles.barTrack}><View style={[styles.barFill,{width:`${Math.max(4,val/(Math.max(1,...Object.values(weekGroups))*1)*100)}%`}]} /></View></View><Text style={styles.bodyText}>{money(val)}</Text></View>)}{!weekRecords.length&&<Text style={styles.mutedText}>No harvests recorded for the current week.</Text>}</View></Card>
    <Button title="View all harvest records" kind="soft" onPress={()=>setTab('records')}/>
  </ScrollView>;

  const RecordsScreen = () => <View style={styles.page}><Text style={styles.screenTitle}>Harvest records</Text><Text style={styles.screenSubtitle}>Search, filter, edit and manage your entries.</Text>
    <TextInput value={search} onChangeText={setSearch} placeholder="Search crop or category…" placeholderTextColor={c.muted} style={styles.searchInput}/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:12}}>{['All',...CATEGORIES].map(x=><Chip key={x} label={x} selected={filter===x} onPress={()=>setFilter(x)}/>)}</ScrollView>
    <Text style={styles.mutedText}>{filtered.length} record(s)</Text>
    <FlatList data={filtered} keyExtractor={x=>x.id} renderItem={renderRecord} contentContainerStyle={{paddingTop:10,paddingBottom:25,flexGrow:1}} ListEmptyComponent={<View style={styles.empty}><Text style={{fontSize:32}}>🌿</Text><Text style={styles.emptyTitle}>No harvest records found</Text><Text style={styles.mutedText}>Add a harvest or change your search filters.</Text><Button title="Add a harvest" onPress={()=>setTab('add')}/></View>} />
  </View>;

  const AddScreen = () => <KeyboardAvoidingView style={styles.page} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:30}}><Text style={styles.screenTitle}>Add a harvest</Text><Text style={styles.screenSubtitle}>Capture a new harvest entry.</Text><Card>
    <Field label="CROP / VEGETABLE NAME" value={crop} onChangeText={setCrop} placeholder="e.g. Tomato" maxLength={45}/>
    <Text style={styles.label}>CATEGORY</Text><View style={styles.chipWrap}>{CATEGORIES.map(x=><Chip key={x} label={x} selected={category===x} onPress={()=>setCategory(x)}/>)}</View>
    <Field label="QUANTITY (KG)" value={qty} onChangeText={setQty} placeholder="e.g. 5.5" keyboardType="decimal-pad"/>
    <Field label="HARVEST DATE (YYYY-MM-DD)" value={harvestDate} onChangeText={setHarvestDate} placeholder="2026-11-23" maxLength={10}/>
    <Text style={styles.helper}>Quantity must be greater than 0 and no more than 1,000 kg. All quantities are stored in kilograms, matching your website.</Text>
    <Button title={busy?'Saving…':'Save harvest record'} onPress={addRecord} disabled={busy}/>
  </Card></ScrollView></KeyboardAvoidingView>;

  const InsightsScreen = () => <ScrollView contentContainerStyle={styles.page}><Text style={styles.screenTitle}>Executive summary</Text><Text style={styles.screenSubtitle}>Harvest performance and weekly trends.</Text>
    <View style={styles.metricsGrid}><Metric label="HIGHEST ENTRY" value={money(highest)}/><Metric label="LOWEST ENTRY" value={money(lowest)}/><Metric label="FRUIT HARVEST" value={money(fruitTotal)}/><Metric label="LEAFY HARVEST" value={money(leafyTotal)}/></View>
    <Card><Text style={styles.cardTitle}>Harvest by crop</Text><Text style={styles.mutedText}>Top six crops by total quantity</Text>{Object.entries(cropTotals).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,val])=><View key={name} style={styles.chartRow}><View style={styles.chartLabelRow}><Text style={styles.bodyText}>{name}</Text><Text style={styles.bodyText}>{money(val)}</Text></View><View style={styles.barTrack}><View style={[styles.barFill,{width:`${Math.max(2,val/(Math.max(1,...Object.values(cropTotals)))*100)}%`}]} /></View></View>)}{!records.length&&<Text style={styles.mutedText}>Add records to see crop totals.</Text>}</Card>
    <Card><Text style={styles.cardTitle}>Weekly harvest totals</Text><Text style={styles.mutedText}>Choose any date to review its Monday–Sunday week.</Text><Field label="DATE IN WEEK (YYYY-MM-DD)" value={weekDate} onChangeText={setWeekDate} placeholder="YYYY-MM-DD" maxLength={10}/><Text style={styles.weekRange}>{weekStart} — {weekEnd}</Text>{Object.entries(weekGroups).sort((a,b)=>b[1]-a[1]).map(([name,val])=><View key={name} style={styles.weekLine}><Text style={styles.bodyText}>{name}</Text><Text style={styles.bodyText}>{money(val)}</Text></View>)}<View style={styles.totalLine}><Text style={styles.totalLabel}>WEEKLY TOTAL</Text><Text style={styles.totalValue}>{money(weekTotal)}</Text></View></Card>
    <Card><Text style={styles.cardTitle}>Export reports</Text><Text style={styles.mutedText}>Share your records or executive summaries.</Text><View style={styles.actionGrid}><Button title="Export CSV" kind="soft" onPress={exportCsv} small/><Button title="Export JSON" kind="soft" onPress={exportJson} small/><Button title="Export TXT" kind="soft" onPress={exportTxt} small/><Button title="Export Markdown" kind="soft" onPress={exportMd} small/></View></Card>
  </ScrollView>;

  const SettingsScreen = () => <ScrollView contentContainerStyle={styles.page}><Text style={styles.screenTitle}>More & settings</Text><Text style={styles.screenSubtitle}>Manage your data, appearance and app preferences.</Text>
    <Card><Text style={styles.cardTitle}>Appearance</Text><Text style={styles.mutedText}>Choose a theme for the app.</Text><View style={styles.chipWrap}>{['system','light','dark'].map(x=><Chip key={x} label={x[0].toUpperCase()+x.slice(1)} selected={themeChoice===x} onPress={()=>setTheme(x)}/>)}</View></Card>
    <Card><Text style={styles.cardTitle}>Data management</Text><Text style={styles.mutedText}>Your records are stored locally in an SQLite database on this device. No account or internet connection is required.</Text><View style={styles.settingsActions}><Button title="Import CSV" kind="soft" onPress={importCsv}/><Button title="Import JSON" kind="soft" onPress={importJson}/><Button title="Export CSV" kind="soft" onPress={exportCsv}/><Button title="Export JSON" kind="soft" onPress={exportJson}/><Button title="Load 40 demo records" kind="soft" onPress={addDemo}/><Button title="Clear all records" kind="danger" onPress={clearAll}/></View></Card>
    <Card><Text style={styles.cardTitle}>About Garden Harvest Register</Text><Text style={styles.bodyText}>Everyday Innovators · Project #67</Text><Text style={styles.mutedText}>Food & Agriculture · Record · Track · Grow</Text><Text style={styles.helper}>This native app preserves the original website's crop categories, kilogram-based validation, dashboard metrics, search and filtering, weekly Monday–Sunday summaries, unusual-entry warning, chart-style crop distribution, CSV and JSON import, and CSV / JSON / TXT / Markdown exports.</Text><Text style={styles.helper}>To move existing website data into this app, export JSON or CSV from the website and import a compatible CSV here. Browser LocalStorage cannot be read directly by a separately installed mobile app.</Text></Card>
  </ScrollView>;

  if (loading || !db) return <SafeAreaView style={[styles.loading,{backgroundColor:c.bg}]}><StatusBar barStyle={dark?'light-content':'dark-content'}/><Text style={{fontSize:38}}>🌱</Text><Text style={[styles.screenTitle,{marginTop:12}]}>Garden Harvest Register</Text><ActivityIndicator color={c.green} style={{marginTop:20}}/><Text style={styles.mutedText}>Preparing your garden dashboard…</Text></SafeAreaView>;
  if (!introDone) return <SafeAreaView style={[styles.root,{backgroundColor:c.bg}]}><StatusBar barStyle={dark?'light-content':'light-content'}/><View style={styles.onboard}><View style={styles.onboardLogo}><Text style={{fontSize:54}}>🌱</Text></View><Text style={styles.heroEyebrow}>EVERYDAY INNOVATORS · #67</Text><Text style={styles.onboardTitle}>Garden Harvest{ '\n'}Register</Text><Text style={styles.onboardText}>A simple, beautiful way to record your harvests, understand weekly totals and keep your garden data close at hand.</Text><View style={styles.onboardPoints}><Text style={styles.bodyText}>✓  Save harvest records offline</Text><Text style={styles.bodyText}>✓  Track crops and weekly totals</Text><Text style={styles.bodyText}>✓  Import and export your data</Text></View><Button title="Get started" onPress={finishIntro}/></View></SafeAreaView>;

  const screen = tab==='home'?<HomeScreen/>:tab==='records'?<RecordsScreen/>:tab==='add'?<AddScreen/>:tab==='insights'?<InsightsScreen/>:<SettingsScreen/>;
  return <SafeAreaView style={styles.root} edges={['top','left','right']}><StatusBar barStyle={dark?'light-content':'dark-content'} backgroundColor={c.bg}/>
    <View style={styles.topbar}><View style={styles.brandMark}><Text style={{fontSize:20}}>🌱</Text></View><View style={{flex:1}}><Text style={styles.brandTitle}>Garden Harvest Register</Text><Text style={styles.brandSub}>RECORD · TRACK · GROW</Text></View><View style={[styles.connectionDot,{backgroundColor:online?c.leaf:c.gold}]}/></View>
    <View style={{flex:1}}>{screen}</View>
    <View style={styles.tabbar}>{NAV.map(item=><Pressable key={item.key} onPress={()=>setTab(item.key)} style={[styles.tabItem,tab===item.key&&styles.tabActive]}><Text style={[styles.tabIcon,tab===item.key&&styles.tabIconActive]}>{item.icon}</Text><Text style={[styles.tabLabel,tab===item.key&&styles.tabLabelActive]}>{item.label}</Text></Pressable>)}</View>
    {busy&&<View style={styles.busyOverlay}><ActivityIndicator size="large" color="#fff"/><Text style={{color:'#fff',marginTop:10,fontWeight:'700'}}>Working…</Text></View>}
    <Modal visible={!!editRecord} transparent animationType="slide" onRequestClose={()=>setEditRecord(null)}><View style={styles.modalShade}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalCard}><Text style={styles.screenTitle}>Edit harvest</Text><Field label="CROP NAME" value={editForm.crop||''} onChangeText={v=>setEditForm({...editForm,crop:v})}/><Text style={styles.label}>CATEGORY</Text><View style={styles.chipWrap}>{CATEGORIES.map(x=><Chip key={x} label={x} selected={editForm.category===x} onPress={()=>setEditForm({...editForm,category:x})}/>)}</View><Field label="QUANTITY (KG)" value={editForm.qty||''} onChangeText={v=>setEditForm({...editForm,qty:v})} keyboardType="decimal-pad"/><Field label="DATE (YYYY-MM-DD)" value={editForm.date||''} onChangeText={v=>setEditForm({...editForm,date:v})}/><View style={{flexDirection:'row',gap:10,marginTop:12}}><View style={{flex:1}}><Button title="Cancel" kind="soft" onPress={()=>setEditRecord(null)}/></View><View style={{flex:1}}><Button title="Save changes" onPress={saveEdit}/></View></View></KeyboardAvoidingView></View></Modal>
  </SafeAreaView>;

  function makeStyles(p) { return StyleSheet.create({
    root:{flex:1,backgroundColor:p.bg}, loading:{flex:1,alignItems:'center',justifyContent:'center'}, page:{paddingHorizontal:18,paddingTop:14,paddingBottom:26,flexGrow:1},
    topbar:{height:64,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderBottomColor:p.line,backgroundColor:p.surface},brandMark:{width:40,height:40,borderRadius:13,backgroundColor:p.surface2,alignItems:'center',justifyContent:'center'},brandTitle:{fontSize:15,fontWeight:'800',color:p.ink},brandSub:{fontSize:9,letterSpacing:1.1,color:p.muted,marginTop:3,fontWeight:'700'},connectionDot:{width:9,height:9,borderRadius:6},
    tabbar:{height:66,backgroundColor:p.surface,borderTopWidth:1,borderTopColor:p.line,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingBottom:Platform.OS==='ios'?2:4},tabItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3,height:58},tabActive:{backgroundColor:p.surface2,borderRadius:14,marginHorizontal:3},tabIcon:{fontSize:20,color:p.muted,fontWeight:'700'},tabIconActive:{color:p.green},tabLabel:{fontSize:10,color:p.muted,fontWeight:'600'},tabLabelActive:{color:p.green,fontWeight:'800'},
    hero:{backgroundColor:p.forest,borderRadius:22,padding:19,flexDirection:'row',alignItems:'center',gap:15,marginBottom:20},heroIcon:{width:54,height:54,borderRadius:17,backgroundColor:'#FFFFFF20',alignItems:'center',justifyContent:'center'},heroEyebrow:{fontSize:9,letterSpacing:1.1,fontWeight:'800',color:'#CDE4D0'},heroTitle:{fontSize:25,fontWeight:'900',color:'#FFFFFF',lineHeight:29,marginTop:7},heroSub:{fontSize:11,color:'#D7EBDD',marginTop:8,letterSpacing:1.2},
    sectionHeading:{marginBottom:10},sectionTitle:{fontSize:18,fontWeight:'900',color:p.ink},mutedText:{fontSize:12,color:p.muted,lineHeight:18},metricsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:18},metric:{width:'48%',flexGrow:1,backgroundColor:p.surface,borderWidth:1,borderColor:p.line,borderRadius:16,padding:14,minHeight:99},metricLabel:{fontSize:9,fontWeight:'800',letterSpacing:.8,color:p.muted},metricValue:{fontSize:22,fontWeight:'900',color:p.forest,marginTop:8},metricCaption:{fontSize:10,color:p.muted,marginTop:3},quickRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
    card:{backgroundColor:p.surface,borderWidth:1,borderColor:p.line,borderRadius:17,padding:16,marginBottom:13},cardTitle:{fontSize:16,fontWeight:'900',color:p.ink,marginBottom:5},bigNumber:{fontSize:30,fontWeight:'900',color:p.forest,marginTop:7},barRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:10},barTrack:{height:7,backgroundColor:p.surface2,borderRadius:10,overflow:'hidden',marginTop:6},barFill:{height:7,backgroundColor:p.leaf,borderRadius:10},
    screenTitle:{fontSize:25,fontWeight:'900',color:p.ink},screenSubtitle:{fontSize:12,color:p.muted,marginTop:5,marginBottom:14},searchInput:{height:47,borderRadius:13,borderWidth:1,borderColor:p.line,backgroundColor:p.surface,paddingHorizontal:14,color:p.ink,fontSize:14},chip:{paddingHorizontal:14,paddingVertical:9,borderRadius:30,backgroundColor:p.surface2,borderWidth:1,borderColor:p.line},chipSelected:{backgroundColor:p.green,borderColor:p.green},chipText:{fontSize:12,fontWeight:'700',color:p.ink},chipWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8,marginBottom:10},
    recordCard:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:9,padding:14},recordCrop:{fontSize:16,fontWeight:'900',color:p.ink},recordQty:{fontSize:14,fontWeight:'900',color:p.green,marginTop:5},recordActions:{gap:7},iconButton:{backgroundColor:p.surface2,paddingHorizontal:11,paddingVertical:8,borderRadius:9},iconButtonText:{fontSize:11,fontWeight:'800',color:p.green},empty:{alignItems:'center',justifyContent:'center',padding:28,gap:9},emptyTitle:{fontSize:16,fontWeight:'800',color:p.ink},
    field:{marginBottom:14},label:{fontSize:10,fontWeight:'800',letterSpacing:.7,color:p.muted,marginBottom:7},input:{height:48,borderWidth:1,borderColor:p.line,borderRadius:11,paddingHorizontal:13,color:p.ink,backgroundColor:p.bg,fontSize:14},helper:{fontSize:11,color:p.muted,lineHeight:17,marginTop:2,marginBottom:15},button:{minHeight:47,backgroundColor:p.green,borderRadius:12,alignItems:'center',justifyContent:'center',paddingHorizontal:15,paddingVertical:12,marginTop:8},buttonSoft:{backgroundColor:p.surface2,borderWidth:1,borderColor:p.line},buttonDanger:{backgroundColor:p.surface2,borderWidth:1,borderColor:p.line},buttonSmall:{minHeight:40,paddingVertical:9,paddingHorizontal:12,flexGrow:1},buttonText:{fontSize:13,fontWeight:'900',color:'#FFFFFF'},
    chartRow:{marginTop:13},chartLabelRow:{flexDirection:'row',justifyContent:'space-between'},bodyText:{fontSize:12,color:p.ink,fontWeight:'600'},weekRange:{fontSize:12,color:p.green,fontWeight:'800',marginBottom:6},weekLine:{flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,borderBottomColor:p.line},totalLine:{flexDirection:'row',justifyContent:'space-between',paddingTop:13,marginTop:3},totalLabel:{fontSize:11,fontWeight:'900',color:p.muted},totalValue:{fontSize:16,fontWeight:'900',color:p.green},actionGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},settingsActions:{gap:5,marginTop:10},
    offline:{padding:11,backgroundColor:p.warning,borderRadius:10,marginBottom:12},warning:{padding:11,backgroundColor:p.warning,borderRadius:10,marginBottom:12},onboard:{flex:1,justifyContent:'center',padding:28},onboardLogo:{width:100,height:100,borderRadius:30,backgroundColor:p.surface2,alignItems:'center',justifyContent:'center',marginBottom:28},onboardTitle:{fontSize:36,fontWeight:'900',color:p.forest,marginTop:12,lineHeight:40},onboardText:{fontSize:15,color:p.muted,lineHeight:23,marginTop:16},onboardPoints:{gap:13,marginTop:25,marginBottom:24},busyOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#0008',alignItems:'center',justifyContent:'center'},modalShade:{flex:1,backgroundColor:'#0009',justifyContent:'flex-end'},modalCard:{backgroundColor:p.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,paddingBottom:35},
  }); }
}
