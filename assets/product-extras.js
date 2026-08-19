/* 商品扩展数据层（详情 + 评价 + 图片占位）
 * 零侵入附加在 Store 之上，不修改 store.js 的 seed()。
 * 商品无 p.img 时用 emoji 占位（彩色 SVG dataURL），详情/评价按商品 hash 稳定生成 mock。
 */
(function (global) {
  'use strict';

  /* ---------- 稳定 hash（同一商品每次生成相同 mock） ---------- */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & 0xFFFFFFFF;
    }
    return Math.abs(h);
  }
  function rnd(seed, n) {
    // 返回 0..n-1 的稳定伪随机
    var s = hash(seed + '|' + n);
    return s % n;
  }
  function pick(arr, seed) { return arr[hash(seed) % arr.length]; }
  function pickN(arr, n, seed) {
    // 取 n 个不重复的稳定抽样（保持原顺序）
    var h = hash(seed);
    var idx = arr.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      h = (h * 1103515245 + 12345) & 0x7FFFFFFF;
      var j = h % (i + 1);
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx.slice(0, n).sort(function (a, b) { return a - b; }).map(function (k) { return arr[k]; });
  }
  function timeAgo(daysAgo) {
    var ts = Date.now() - daysAgo * 86400000 - Math.floor(Math.random() * 86400000);
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- Emoji 占位图（SVG dataURL） ---------- */
  function getEmojiImage(p, size) {
    size = size || 800;
    var emoji = p.emoji || '🍴';
    var bg = p.color || '#FFF1DD';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        '<defs>' +
          '<radialGradient id="g" cx="50%" cy="38%" r="65%">' +
            '<stop offset="0%" stop-color="' + bg + '" stop-opacity="1"/>' +
            '<stop offset="100%" stop-color="' + shadeColor(bg, -10) + '" stop-opacity="1"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<rect width="100%" height="100%" fill="url(#g)"/>' +
        '<text x="50%" y="50%" font-size="' + Math.floor(size * 0.55) + '" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, NotoColorEmoji, sans-serif">' + emoji + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function shadeColor(hex, percent) {
    // hex: #RRGGBB, 返回加深/减淡后的 hex
    var n = parseInt(hex.replace('#', ''), 16);
    var r = (n >> 16) & 0xFF, g = (n >> 8) & 0xFF, b = n & 0xFF;
    r = Math.max(0, Math.min(255, r + Math.round(255 * percent / 100)));
    g = Math.max(0, Math.min(255, g + Math.round(255 * percent / 100)));
    b = Math.max(0, Math.min(255, b + Math.round(255 * percent / 100)));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  /* ---------- 商品图片数组（详情页轮播） ---------- */
  function getImages(p) {
    if (p.img) {
      // 1 张真图 + 2 张 emoji 装饰图（演示版用 emoji 凑 3 张，后续 admin 上传多图后自动用真图）
      return [p.img, getEmojiImage(p, 800), getEmojiImage(p, 800)];
    }
    // 3 张 emoji 不同视角（同色不同 emoji 模拟），给用户"多图"感觉
    var set = getEmojiSet(p);
    return set.map(function (e) { return getEmojiImage({ emoji: e, color: p.color }, 800); });
  }
  function getEmojiSet(p) {
    // 根据 hash 选 3 个相近 emoji
    var cat = p.cat || '';
    var pool = EMOJI_POOL[cat] || EMOJI_POOL._default;
    var seed = p.id + '|' + p.name;
    var picked = pickN(pool, 3, seed);
    // 第一张保证是商品本身 emoji（让首图有辨识度）
    picked[0] = p.emoji || pool[0];
    return picked;
  }
  var EMOJI_POOL = {
    '招牌套餐':   ['🥢', '🍱', '🍚', '🥘', '🍜', '🥣'],
    '中式早餐':   ['🥟', '🍜', '🥣', '🥢', '🍲', '🌯'],
    '西式面包':   ['🥐', '🥪', '🥙', '🍞', '🧈'],
    '豆浆饮品':   ['🥛', '☕', '🧋', '🍵', '🥤'],
    '小吃配菜':   ['🥚', '🥒', '🌶️', '🥗', '🧆', '🥕'],
    '_default':   ['🍴', '🍽️', '🥢', '🍱']
  };

  /* ---------- 商品详情（原料/份量/荤素/制作方法） ---------- */
  function getDetail(p) {
    // 商家已配置则优先
    if (p.detail && typeof p.detail === 'object' && Object.keys(p.detail).length) return p.detail;
    // 按 cat + 商品名 hash 选稳定模板
    var seed = p.id + '|' + p.name;
    var d = DETAIL_TEMPLATE[cat(p)] || DETAIL_TEMPLATE._default;
    return {
      desc: p.desc || d.desc,
      raw: d.raw[hash(seed + 'raw') % d.raw.length],
      serving: d.serving[hash(seed + 'serving') % d.serving.length],
      type: d.type[hash(seed + 'type') % d.type.length],
      method: d.method[hash(seed + 'method') % d.method.length],
      shelf: d.shelf[hash(seed + 'shelf') % d.shelf.length],
      tips: d.tips[hash(seed + 'tips') % d.tips.length]
    };
  }
  function cat(p) { return p.cat || ''; }

  var DETAIL_TEMPLATE = {
    '招牌套餐': {
      desc: '店长推荐套餐，分量足味道好，老客复购率超高。',
      raw: ['优质大米、鲜肉、时蔬、秘制酱料', '东北珍珠米、土鸡蛋、新鲜青菜、自调卤汁', '本地鲜肉、有机蔬菜、农家土鸡蛋'],
      serving: ['1 人份（建议单人享用）', '1-2 人份（可分食）', '单人份（女生刚好，男生建议 +1）'],
      type: ['荤素搭配', '含肉制品', '荤菜'],
      method: ['现炒现做，出餐 5 分钟', '现煮现炖，需等 8-10 分钟', '现炸现拌，立等可取'],
      shelf: ['建议现做现吃，不要久放', '冷藏保存 24 小时内吃完', '常温 2 小时内食用最佳'],
      tips: ['下单后请耐心等待制作', '堂食口感最佳，外带请尽快食用', '可备注辣度（微辣/中辣/重辣）']
    },
    '中式早餐': {
      desc: '现做热乎的传统中式早餐，唤醒你的早晨。',
      raw: ['面粉、鲜肉、小葱、自磨调料', '优质大米、五花肉、时蔬、高汤', '现磨黄豆、面粉、土鸡蛋'],
      serving: ['1 人份（女生可吃饱）', '1-2 人份', '单人份（分量扎实）'],
      type: ['荤菜', '素菜', '荤素搭配'],
      method: ['现蒸现煎，约 5 分钟', '现熬现煮，约 10 分钟', '现炸现拌，立等可取'],
      shelf: ['趁热食用最佳', '常温 4 小时内食用', '冷藏保存 12 小时'],
      tips: ['早高峰请提前 5 分钟下单', '可备注不加葱/香菜', '搭配豆浆油条更香～']
    },
    '西式面包': {
      desc: '现烤西式面包，酥脆松软，搭配一杯饮品就是完美下午茶。',
      raw: ['高筋面粉、安佳黄油、牛奶、酵母', '全麦粉、鸡蛋、火腿、生菜、沙拉酱', '小麦粉、奶油、芝士'],
      serving: ['1 个（独立装）', '1 人份', '2 人份（可分享）'],
      type: ['荤素搭配', '素菜', '荤菜'],
      method: ['烤箱现烤 3 分钟', '立等可取', '现烤现切，出餐 5 分钟'],
      shelf: ['常温 4 小时内食用最佳', '冷藏 24 小时', '不可久放，建议现做现吃'],
      tips: ['可备注加热/不加热', '配生菜不加请备注', '搭配饮料满 20 减 5']
    },
    '豆浆饮品': {
      desc: '现磨豆浆/精选饮品，营养健康，喝出好气色。',
      raw: ['东北非转基因黄豆、纯净水', '进口奶粉、现萃咖啡豆', '精选茶叶、鲜奶'],
      serving: ['中杯 350ml', '大杯 500ml', '标准杯 400ml'],
      type: ['素菜（无蛋无肉）', '奶制品', '含奶制品'],
      method: ['现磨现煮，出餐 3 分钟', '现萃现调，约 2 分钟', '现摇现调，立等可取'],
      shelf: ['常温 2 小时内饮用', '冷藏 12 小时', '建议现做现喝'],
      tips: ['可备注不加糖/少糖', '冰量可选（正常冰/少冰/去冰）', '杯型可换大杯 +2 元']
    },
    '小吃配菜': {
      desc: '解腻开胃的佐餐小菜，配主食更香。',
      raw: ['新鲜时蔬、自调酱料', '土鸡蛋、香叶、八角、桂皮', '时令蔬菜、香醋、白糖'],
      serving: ['1 份（约 80g）', '1 份（佐餐量）', '1 小份'],
      type: ['素菜', '荤菜', '荤素搭配'],
      method: ['现拌现做，立等可取', '现卤现切，出餐 3 分钟', '现腌现拌，约 2 分钟'],
      shelf: ['冷藏 24 小时', '常温 6 小时内食用', '建议现做现吃'],
      tips: ['可备注辣度', '配粥/套餐更划算', '可单点也可拼']
    },
    '_default': {
      desc: '本店招牌商品，由主厨精心制作。',
      raw: ['新鲜食材、主厨秘制调料', '优选原料、当日采购', '本地直供、源头可溯'],
      serving: ['1 人份', '单人份（女生可吃饱）', '2 人份（可分享）'],
      type: ['荤素搭配', '素菜', '荤菜'],
      method: ['现做现卖，立等可取', '现炒现做，约 5 分钟', '现煮现炖，约 10 分钟'],
      shelf: ['常温 4 小时内食用', '冷藏 24 小时', '建议现做现吃'],
      tips: ['下单后请耐心等待', '可备注辣度/忌口', '搭配套餐更划算']
    }
  };

  /* ---------- 商品评价（按 hash 稳定 mock） ---------- */
  var USER_POOL = [
    { name: '美食家小王', color: '#FF6B6B' },
    { name: '隔壁老李',   color: '#4ECDC4' },
    { name: 'Aimee',      color: '#FFD93D' },
    { name: '饭点必到',   color: '#6BCB77' },
    { name: '二狗子',     color: '#C589E8' },
    { name: '小仙女',     color: '#FF8DC3' },
    { name: '程序员阿强', color: '#5DADE2' },
    { name: 'Lisa 姐',    color: '#F39C12' },
    { name: '深夜食堂',   color: '#8E44AD' },
    { name: '吃货日记',   color: '#16A085' },
    { name: 'Gary',       color: '#34495E' },
    { name: '隔壁班花',   color: '#E91E63' },
    { name: '大胃王',     color: '#795548' },
    { name: '小米粥',     color: '#607D8B' }
  ];

  var REVIEW_POOL = [
    '味道很棒，分量也足，已经回购第三次了～',
    '外卖包装完好，没有洒漏，下次还会点。',
    '性价比超高，比外面店里便宜还好吃。',
    '现做现卖，拿到手还是热的，良心商家。',
    '口感很新鲜，食材能吃出来是不错的原料。',
    '分量女生刚好够吃，男生建议 +1。',
    '老板态度好，送错了一份主动补了一份，超赞。',
    '包装精美，送朋友也很合适。',
    '口味正宗，跟我小时候在家吃的一个味道。',
    '出餐速度挺快的，早上来不及做饭就靠它。',
    '价格实惠，味道也不错，五星好评。',
    '这个价位能吃到这种品质，真的很良心。',
    '女朋友很喜欢，已经成为我们的早餐标配。',
    '孩子也不挑食了，每次都能吃完一整份。',
    '会一直回购，希望品质不要变。',
    '老板说是当天采购的新鲜食材，吃得出来。',
    '套餐搭配很合理，单点也划算。',
    '第一次尝试就爱上了，强烈推荐给同事。',
    '中午来不及做饭的时候全靠它救急。',
    '味道不算惊艳但绝对不踩雷，日常点单款。'
  ];

  function getReviews(p, count) {
    count = count || 8;
    var seed = p.id + '|' + p.name;
    var users = pickN(USER_POOL, Math.min(count, USER_POOL.length), seed);
    var reviews = [];
    for (var i = 0; i < count; i++) {
      var u = users[i % users.length];
      var stars = 5 - (i < count * 0.05 ? 2 : (i < count * 0.15 ? 1 : 0)); // 极少数差评
      var daysAgo = i + Math.floor(rnd(seed + '|' + i, 30));
      reviews.push({
        user: u.name,
        color: u.color,
        stars: stars,
        text: pick(REVIEW_POOL, seed + '|t|' + i),
        time: timeAgo(daysAgo),
        initial: u.name.charAt(0)
      });
    }
    return reviews;
  }

  function getRating(p) {
    var seed = p.id + '|' + p.name;
    var pct = 95 + (hash(seed + 'rating') % 5); // 95~99
    var sold = p.sold || 0;
    var count = Math.max(8, Math.min(500, Math.floor(sold * 0.18)));
    return { percent: pct, count: count };
  }

  global.ProductExtras = {
    getImages: getImages,
    getEmojiImage: getEmojiImage,
    getDetail: getDetail,
    getReviews: getReviews,
    getRating: getRating
  };
})(window);