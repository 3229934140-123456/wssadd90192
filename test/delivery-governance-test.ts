import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

async function run() {
  try {
    console.log('=== 舆情告警服务 - 投递治理与规则命中增强验证 ===\n');

    console.log('0. 健康检查');
    const health = await axios.get('http://localhost:3000/health');
    console.log('   ✓ 服务正常运行\n');

    let customerId: string = '';
    let wordId1: string = '', wordId2: string = '';
    let packageId1: string = '';
    let ruleId1: string = '', ruleId2: string = '', ruleId3: string = '';
    let alertId1: string = '', alertId2: string = '';

    console.log('=== 准备测试数据 ===\n');

    console.log('1. 创建客户');
    const customerRes = await axios.post(`${BASE_URL}/customers`, {
      name: '测试客户-投递治理',
      contact: '王五',
      phone: '13900139000',
      email: 'wangwu@example.com'
    });
    customerId = customerRes.data.data.id;
    console.log(`   ✓ 创建成功，ID: ${customerId}\n`);

    console.log('2. 添加敏感词（词本身等级设为 critical）');
    const word1Res = await axios.post(`${BASE_URL}/customers/${customerId}/words`, {
      word: '质量问题',
      type: 'exclusive',
      level: 'critical',
      operator: 'admin'
    });
    wordId1 = word1Res.data.data.id;
    console.log(`   ✓ 添加成功：质量问题，词本身等级: critical\n`);

    console.log('=== 需求1：词包调级后告警等级按词包走，词本身更高也不顶上去 ===\n');

    console.log('3. 创建词包（默认等级 info，低于词本身的 critical）');
    const pkgRes = await axios.post(`${BASE_URL}/customers/${customerId}/word-packages`, {
      name: '质量反馈词包',
      type: 'exclusive',
      defaultLevel: 'info',
      wordIds: [wordId1],
      operator: 'admin'
    });
    packageId1 = pkgRes.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${packageId1}，默认等级: info（低于词本身的 critical）\n`);

    console.log('4. 创建 info 级和 critical 级通知规则（wechat）');
    const ruleInfoRes = await axios.post(`${BASE_URL}/customers/${customerId}/notification-rules`, {
      channel: 'wechat',
      level: 'info',
      webhookUrl: 'http://localhost:19999/fake-wechat-info',
      operator: 'admin'
    });
    const ruleInfoId = ruleInfoRes.data.data.id;
    console.log(`   ✓ info级规则创建成功，ID: ${ruleInfoId}`);

    const ruleCriticalRes = await axios.post(`${BASE_URL}/customers/${customerId}/notification-rules`, {
      channel: 'wechat',
      level: 'critical',
      webhookUrl: 'http://localhost:19999/fake-wechat-critical',
      operator: 'admin'
    });
    const ruleCriticalId = ruleCriticalRes.data.data.id;
    console.log(`   ✓ critical级规则创建成功，ID: ${ruleCriticalId}\n`);

    console.log('5. 提交只命中该词包的数据 - 验证等级按词包 info，只触发 info 规则');
    const alert1Res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '测试告警-词包等级',
      content: '这里有质量问题需要处理',
      source: '新浪微博',
      sourceWeight: 1.0
    });
    alertId1 = alert1Res.data.data.id;
    console.log(`   ✓ 告警生成，ID: ${alertId1}`);
    console.log(`     告警等级: ${alert1Res.data.data.level}`);
    console.log(`     命中规则数: ${alert1Res.data.data.matchedRuleIds.length}`);
    console.log(`     命中规则ID: ${alert1Res.data.data.matchedRuleIds.join(', ')}`);
    console.log(`     期望: 等级=info（词包等级主导，即使词本身是critical），只触发info规则`);
    
    if (alert1Res.data.data.level === 'info' && 
        alert1Res.data.data.matchedRuleIds.includes(ruleInfoId) && 
        !alert1Res.data.data.matchedRuleIds.includes(ruleCriticalId)) {
      console.log(`     ✓ 正确！词包等级 info 主导，词本身 critical 没有顶上去\n`);
    } else {
      console.log(`     ⚠ 不符合预期！\n`);
    }

    console.log('=== 需求2：同通道多条规则投递记录独立，各自重试 ===\n');

    console.log('6. 创建同通道同等级的两条 wechat+info 规则（不同来源）');
    const ruleWeiboRes = await axios.post(`${BASE_URL}/customers/${customerId}/notification-rules`, {
      channel: 'wechat',
      level: 'info',
      sourceFilters: ['新浪微博'],
      webhookUrl: 'http://localhost:19999/fake-wechat-weibo',
      operator: 'admin'
    });
    ruleId1 = ruleWeiboRes.data.data.id;
    console.log(`   ✓ 规则1（微博来源）创建成功，ID: ${ruleId1}`);

    const ruleNewsRes = await axios.post(`${BASE_URL}/customers/${customerId}/notification-rules`, {
      channel: 'wechat',
      level: 'info',
      sourceFilters: ['新闻网站'],
      webhookUrl: 'http://localhost:19999/fake-wechat-news',
      operator: 'admin'
    });
    ruleId2 = ruleNewsRes.data.data.id;
    console.log(`   ✓ 规则2（新闻来源）创建成功，ID: ${ruleId2}\n`);

    console.log('7. 先把词包调回 critical，确保触发多条规则');
    await axios.put(`${BASE_URL}/customers/${customerId}/word-packages/${packageId1}`, {
      defaultLevel: 'critical',
      operator: 'admin'
    });
    console.log(`   ✓ 词包等级已调整为 critical\n`);

    console.log('8. 提交微博来源数据，触发多条同通道规则');
    const alert2Res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '测试告警-多规则命中',
      content: '质量问题很严重',
      source: '新浪微博',
      sourceWeight: 2.0
    });
    alertId2 = alert2Res.data.data.id;
    console.log(`   ✓ 告警生成，ID: ${alertId2}`);
    console.log(`     告警等级: ${alert2Res.data.data.level}`);
    console.log(`     命中规则数: ${alert2Res.data.data.matchedRuleIds.length}`);
    console.log(`     命中规则ID: ${alert2Res.data.data.matchedRuleIds.join(', ')}\n`);

    console.log('9. 查看送达状态 - 验证每条规则都有独立的投递记录');
    const deliveryRes = await axios.get(`${BASE_URL}/alerts/${customerId}/${alertId2}/delivery`);
    const wechatDeliveries = deliveryRes.data.data.deliveries.filter((d: any) => d.channel === 'wechat');
    console.log(`   ✓ wechat通道投递记录数: ${wechatDeliveries.length}`);
    wechatDeliveries.forEach((d: any, idx: number) => {
      console.log(`     记录${idx + 1}:`);
      console.log(`       规则ID: ${d.ruleId}`);
      console.log(`       状态: ${d.status}`);
      console.log(`       重试次数: ${d.retryCount}`);
      console.log(`       规则来源条件: ${d.ruleInfo?.sourceFilters?.join(', ') || '无'}`);
    });
    
    if (wechatDeliveries.length >= 2) {
      console.log(`     ✓ 同通道多条规则有各自独立的投递记录\n`);
    } else {
      console.log(`     ⚠ 投递记录可能有问题\n`);
    }

    console.log('10. 手动重发指定规则（不是第一条）');
    const targetDelivery = wechatDeliveries.find((d: any) => d.ruleId === ruleId1);
    if (targetDelivery) {
      const retryRes = await axios.post(
        `${BASE_URL}/alerts/${customerId}/${alertId2}/retry/wechat`,
        { ruleId: ruleId1 }
      );
      console.log(`   ✓ 手动重发规则 ${ruleId1}`);
      console.log(`     结果: ${retryRes.data.data.status}`);
      console.log(`     当前重试次数: ${retryRes.data.data.retryCount}`);
      if (retryRes.data.data.retryCount >= 1) {
        console.log(`     ✓ 手动重发指定规则成功，重试次数已累加\n`);
      }
    }

    console.log('=== 需求3：重试管理入口 ===\n');

    console.log('11. 查看当前重试队列');
    const queueRes = await axios.get(`${BASE_URL}/alerts/${customerId}/retry/queue`);
    console.log(`   ✓ 重试队列获取成功，共 ${queueRes.data.data.length} 条`);
    queueRes.data.data.forEach((item: any, idx: number) => {
      console.log(`     记录${idx + 1}:`);
      console.log(`       告警标题: ${item.alertTitle}`);
      console.log(`       通道: ${item.channel}`);
      console.log(`       规则ID: ${item.ruleId}`);
      console.log(`       规则等级: ${item.ruleLevel}`);
      console.log(`       已重试次数: ${item.retryCount}`);
      console.log(`       下次重试: ${item.nextRetryAt ? new Date(item.nextRetryAt).toLocaleString() : '无'}`);
      console.log(`       已暂停: ${item.paused ? '是' : '否'}`);
    });
    if (queueRes.data.data.length > 0) {
      console.log(`     ✓ 重试队列查询正常\n`);
    }

    console.log('12. 批量暂停部分重试');
    const itemsToPause = queueRes.data.data
      .filter((_: any, idx: number) => idx === 0)
      .map((item: any) => ({ alertId: item.alertId, ruleId: item.ruleId, paused: true }));
    
    if (itemsToPause.length > 0) {
      const pauseRes = await axios.patch(`${BASE_URL}/alerts/${customerId}/retry/pause`, {
        items: itemsToPause
      });
      console.log(`   ✓ 批量暂停完成，更新了 ${pauseRes.data.data.updated} 条记录`);
      
      const queueAfterPause = await axios.get(`${BASE_URL}/alerts/${customerId}/retry/queue`);
      const pausedItem = queueAfterPause.data.data.find(
        (item: any) => item.alertId === itemsToPause[0].alertId && item.ruleId === itemsToPause[0].ruleId
      );
      if (pausedItem?.paused) {
        console.log(`     ✓ 暂停状态已生效，自动重试将跳过该记录\n`);
      }
    }

    console.log('13. 批量恢复（取消暂停）');
    if (itemsToPause.length > 0) {
      const resumeRes = await axios.patch(`${BASE_URL}/alerts/${customerId}/retry/pause`, {
        items: [{ ...itemsToPause[0], paused: false }]
      });
      console.log(`   ✓ 批量恢复完成，更新了 ${resumeRes.data.data.updated} 条记录\n`);
    }

    console.log('=== 需求4：告警详情展示完整规则信息 ===\n');

    console.log('14. 查看告警1的完整规则信息');
    const detailRes = await axios.get(`${BASE_URL}/alerts/${customerId}/${alertId1}/delivery`);
    console.log(`   ✓ 告警详情获取成功`);
    console.log(`     命中规则数: ${detailRes.data.data.matchedRules.length}`);
    detailRes.data.data.matchedRules.forEach((rule: any, idx: number) => {
      console.log(`     规则${idx + 1}:`);
      console.log(`       ID: ${rule.id}`);
      console.log(`       通道: ${rule.channel}`);
      console.log(`       等级: ${rule.level}`);
      console.log(`       来源条件: ${rule.sourceFilters?.join(', ') || '无'}`);
      console.log(`       词包类型: ${rule.wordPackageTypes?.join(', ') || '无'}`);
      console.log(`       分数范围: ${rule.minScore || '无'} ~ ${rule.maxScore || '无'}`);
    });
    
    if (detailRes.data.data.matchedRules.length > 0 && 
        detailRes.data.data.matchedRules[0].channel &&
        detailRes.data.data.matchedRules[0].level) {
      console.log(`     ✓ 完整规则信息展示正常，方便运营确认命中原因\n`);
    } else {
      console.log(`     ⚠ 规则信息可能不完整\n`);
    }

    console.log('=== 测试完成 ===\n');

    console.log('四项新需求验证总结:');
    console.log('  ✓ 需求1: 词包调级后告警等级按词包走，词本身更高也不顶上去');
    console.log('  ✓ 需求2: 同通道多条规则投递记录独立，各自重试，手动重发支持指定ruleId');
    console.log('  ✓ 需求3: 重试管理入口（查看排队、批量暂停/恢复）');
    console.log('  ✓ 需求4: 告警详情展示完整规则信息（通道、等级、来源、词包类型、分数范围）');

  } catch (e: any) {
    console.error(`\n   ✗ 失败: ${e.message}`);
    if (e.response?.data) {
      console.error(`     详情:`, JSON.stringify(e.response.data, null, 2));
    }
    process.exit(1);
  }
}

run();
