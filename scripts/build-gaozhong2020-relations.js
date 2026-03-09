/**
 * 生成 gw-square-text-relations.init_data.json（72条）
 * - text_id：在 init 中则用 init 的 _id，否则在 backup 中按标题查找 _id
 * - _id：rel_YYYYMMDD_001..072
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const initPath = path.join(ROOT, 'uniCloud-alipay/database/gw-ancient-texts.init_data.json');
const backupPath = path.join(ROOT, 'data/database-backup/gw-ancient-texts.json');
const outPath = path.join(ROOT, 'uniCloud-alipay/database/gw-square-text-relations.init_data.json');

function norm(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .replace(/\s+/g, '')
    .replace(/[《》]/g, '')
    .replace(/（并序）/g, '')
    .replace(/并序/g, '')
    .replace(/（节选）/g, '')
    .replace(/[・·]/g, '')  // 统一去掉间隔号，便于与 backup 匹配
    .replace(/\.\.\./g, '')
    .trim();
}

// 备份中标题与课标不完全一致时的映射（normTitle -> backup _id），优先高中来源
const BACKUP_TITLE_MAP = {
  '劝学（荀子节选）': 'gw-at-20240101-081',
  '过秦论（上）': 'gw-at-20240101-103',
  '五代史伶官传序': 'gw-at-20240101-105',
  '大学（礼记节选）': 'gw-at-20240101-097',
  '念奴娇赤壁怀古': 'gw-at-20240101-079',
  '定风波': 'gw-at-20260302-057',
  '永遇乐京口北固亭怀古': 'gw-at-20240101-080',
  '沁园春长沙': 'gw-at-20240101-074'
};

// 72 篇标准顺序标题（与 gaozhong2020-001..072 对应），用于在 backup 中查找
const TITLES_72 = [
  '《论语》十二章', '劝学（《荀子》节选）', '屈原列传（节选）', '谏太宗十思疏', '师说', '阿房宫赋', '六国论', '答司马谏议书', '赤壁赋', '项脊轩志',
  '子路、曾皙、冉有、公西华侍坐', '报任安书（节选）', '过秦论（上）', '礼运（《礼记》节选）', '陈情表', '归去来兮辞（并序）', '种树郭橐驼传', '五代史伶官传序', '石钟山记', '登泰山记',
  '《老子》八章', '季氏将伐颛臾', '大学（《礼记》节选）', '中庸（《礼记》节选）', '《孟子》一则（敢问夫子恶乎长）', '逍遥游（《庄子》节选）', '谏逐客书', '兰亭集序', '滕王阁序', '黄冈竹楼记',
  '上枢密韩太尉书', '古代文论选段（《文心雕龙》《诗品》等）', '静女', '无衣', '氓', '离骚（节选）', '涉江采芙蓉', '短歌行', '归园田居（其一）', '春江花月夜',
  '山居秋暝', '蜀道难', '梦游天姥吟留别', '将进酒', '燕歌行', '蜀相', '客至', '登高', '登岳阳楼', '琵琶行（并序）',
  '李凭箜篌引', '菩萨蛮', '锦瑟', '虞美人', '望海潮', '雨霖铃', '念奴娇·赤壁怀古', '定风波', '水龙吟·登建康赏心亭', '永遇乐·京口北固亭怀古',
  '声声慢', '书愤', '临安春雨初霁', '窦娥冤（节选）', '长亭送别（节选）', '朝天子·咏喇叭', '沁园春·长沙', '芣苢', '插秧歌', '鹊桥仙',
  '桂枝香·金陵怀古', '念奴娇·过洞庭'
];

const initTexts = JSON.parse(fs.readFileSync(initPath, 'utf8'));
const initById = {};
const initByNormTitle = {};
initTexts.forEach(t => {
  initById[t._id] = t;
  initByNormTitle[norm(t.title)] = t._id;
});

// backup: 每行一个 JSON
const backupLines = fs.readFileSync(backupPath, 'utf8').trim().split('\n');
const backupByNormTitle = {};
backupLines.forEach(line => {
  try {
    const rec = JSON.parse(line);
    const id = rec._id;
    const title = rec.title;
    const n = norm(title);
    if (!n) return;
    const src = (rec.source || '').toString();
    const isGaozhong = /高中|高一|高二|高三/.test(src);
    if (!backupByNormTitle[n] || isGaozhong) backupByNormTitle[n] = id;
  } catch (e) {}
});

// 72 篇分组：1-10 必修，11-20 选择性必修，21-32 选修，33-72 诗词曲40首
function getGroupId(sort) {
  if (sort <= 10) return 'grp_gaozhong2020_bixiu';
  if (sort <= 20) return 'grp_gaozhong2020_xuanze';
  if (sort <= 32) return 'grp_gaozhong2020_xiuxuan';
  return 'grp_gaozhong2020_shici40';
}

const dateStr = '20260309';
const created_at = { $date: 1704067200000 };
const relations = [];

for (let i = 0; i < 72; i++) {
  const sort = i + 1;
  const suffix = String(sort).padStart(3, '0');
  const gwId = 'gw-at-gaozhong2020-' + suffix;
  const title = TITLES_72[i];
  const nTitle = norm(title);
  let textId = initById[gwId] ? gwId : (initByNormTitle[nTitle] || backupByNormTitle[nTitle] || BACKUP_TITLE_MAP[nTitle] || gwId);
  relations.push({
    _id: `rel_${dateStr}_${suffix}`,
    text_id: textId,
    subcollection_id: 'sub_gaozhong2020',
    group_id: getGroupId(sort),
    sort,
    enabled: true,
    created_at
  });
}

const lines = ['['].concat(
  relations.map((r, i) => '  ' + JSON.stringify(r) + (i < relations.length - 1 ? ',' : ''))
).concat([']']);
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log('Wrote', relations.length, 'relations to', outPath);
const fromInit = relations.filter(r => r.text_id.startsWith('gw-at-gaozhong2020-')).length;
const fromBackup = relations.length - fromInit;
console.log('From init:', fromInit, 'From backup:', fromBackup);
