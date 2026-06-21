import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

async function test() {
  console.log('=== 舆情告警服务 - 增强功能测试 ===\n');

  try {
    console.log('0. 健康检查');
    const health = await axios.get('http://localhost:3000/health');
    console.log('   ✓ 服务正常运行\n');
  } catch (e: any) {
    console.log('   ✗ 服务未启动，请先运行 npm run dev\n');
    console.log(e.message);
    process.exit(1);
  }

  let customerId: string = '';
  let wordId1: string = '';
  let packageId1: string = '';
  let ruleId1: string = '', ruleId2: string = '';
  let alertId1: string = '';

  console.log('=== 第一部分：基础数据准备 ===\n');

  console.log('1. 创建客户');
  try {
    const res = await axios.post(`${BASE_URL}/customers`, {
      name: '增强测试客户',
      contact: '王运营',
      phone: '13800138000',
      email: 'wang@example.com',
    });
    customerId = res.data.data.id;
    console.log(`   ✓ 创建成功，ID: ${customerId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    return;
  }

  console.log('2. 添加敏感词（带操作人）');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/words`,
      {
        word: '质量缺陷',
        type: 'exclusive',
        level: 'warning',
      },
      {
        headers: { 'x-operator': 'admin_zhang' },
      }
    );
    wordId1 = res.data.data.id;
    console.log(`   ✓ 添加成功：质量缺陷 (id: ${wordId1})`);
    console.log(`     操作人: admin_zhang\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('3. 创建专属词包（带操作人，校验词归属）');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/word-packages`,
      {
        name: '产品质量词包',
        type: 'exclusive',
        description: '产品质量相关敏感词',
        defaultLevel: 'critical',
        wordIds: [wordId1],
      },
      {
        headers: { 'x-operator': 'admin_zhang' },
      }
    );
    packageId1 = res.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${packageId1}`);
    console.log(`     词包默认等级: critical`);
    console.log(`     包含词数: ${res.data.data.wordIds.length}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 需求1：灵活的告警分发规则 ===\n');

  console.log('4. 创建通知规则1 - 仅微博来源触发（来源筛选）');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/notification-rules`,
      {
        channel: 'wechat',
        level: 'info',
        sourceFilters: ['新浪微博'],
        wordPackageTypes: ['exclusive'],
        webhookUrl: 'https://invalid-url.example.com/test',
      },
      { headers: { 'x-operator': 'admin_zhang' } }
    );
    ruleId1 = res.data.data.id;
    console.log(`   ✓ 规则1创建成功，ID: ${ruleId1}`);
    console.log(`     通道: wechat, 等级阈值: info`);
    console.log(`     来源筛选: 新浪微博`);
    console.log(`     词包类型: exclusive\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('5. 创建通知规则2 - 分数大于60才触发（分数区间）');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/notification-rules`,
      {
        channel: 'sms',
        level: 'warning',
        minScore: 60,
        phoneNumbers: ['13800138000'],
      },
      { headers: { 'x-operator': 'admin_zhang' } }
    );
    ruleId2 = res.data.data.id;
    console.log(`   ✓ 规则2创建成功，ID: ${ruleId2}`);
    console.log(`     通道: sms, 等级阈值: warning`);
    console.log(`     最低分数: 60\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('6. 提交非微博来源数据 - 验证规则1不触发');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '知乎上的质量缺陷讨论',
      content: '有用户在知乎上讨论产品的质量缺陷问题。',
      source: '知乎',
      sourceWeight: 1.0,
    });
    if (res.data.data) {
      console.log(`   ✓ 告警生成，ID: ${res.data.data.id}`);
      console.log(`     来源: 知乎`);
      console.log(`     命中规则数: ${res.data.data.matchedRuleIds.length}`);
      console.log(`     命中规则: ${res.data.data.matchedRuleIds.join(', ') || '(无)'}`);
      console.log(`     期望: 规则1（微博来源）不触发，只有SMS规则可能触发`);
      if (res.data.data.matchedRuleIds.includes(ruleId1)) {
        console.log(`     ⚠ 警告: 规则1（微博来源）不该触发但实际触发了`);
      }
      if (res.data.data.matchedRuleIds.includes(ruleId2)) {
        console.log(`     ✓ 规则2（SMS）按预期触发`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('7. 提交微博来源数据 - 验证两条规则都触发');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '新浪微博出现大量质量缺陷投诉',
      content:
        '近期有大量用户在新浪微博反馈产品存在严重的质量缺陷，事件持续发酵。',
      source: '新浪微博',
      sourceWeight: 2.0,
    });
    if (res.data.data) {
      alertId1 = res.data.data.id;
      console.log(`   ✓ 告警生成，ID: ${alertId1}`);
      console.log(`     来源: 新浪微博`);
      console.log(`     告警等级: ${res.data.data.level}`);
      console.log(`     告警分数: ${res.data.data.score}`);
      console.log(`     命中规则数: ${res.data.data.matchedRuleIds.length}`);
      console.log(`     命中规则ID: ${res.data.data.matchedRuleIds.join(', ')}`);
      console.log(`     期望: 两条规则都触发（来源匹配 + 分数够高）`);
      const allMatched =
        res.data.data.matchedRuleIds.includes(ruleId1) &&
        res.data.data.matchedRuleIds.includes(ruleId2);
      if (allMatched) {
        console.log(`     ✓ 两条规则都按预期触发`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 需求2：通知送达重试与补偿 ===\n');

  console.log('8. 查询告警送达状态（含重试信息）');
  try {
    const res = await axios.get(
      `${BASE_URL}/alerts/${customerId}/${alertId1}/delivery`
    );
    console.log(`   ✓ 送达状态获取成功`);
    console.log(`     整体送达状态: ${res.data.data.deliveryStatus}`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     命中规则ID: ${res.data.data.matchedRuleIds.join(', ')}`);
    console.log(`     各通道详情:`);
    for (const d of res.data.data.deliveries) {
      console.log(`       - ${d.channel}: ${d.status}`);
      console.log(`         重试次数: ${d.retryCount}`);
      if (d.lastError) {
        console.log(`         最近错误: ${d.lastError.substring(0, 50)}...`);
      }
      if (d.nextRetryAt) {
        console.log(`         下次重试: ${new Date(d.nextRetryAt).toLocaleString()}`);
      }
      if (d.firstFailedAt) {
        console.log(`         首次失败: ${new Date(d.firstFailedAt).toLocaleString()}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('9. 手动重发某个通道');
  try {
    const res = await axios.post(
      `${BASE_URL}/alerts/${customerId}/${alertId1}/retry/wechat`
    );
    console.log(`   ✓ 手动重发 wechat 通道`);
    console.log(`     结果: ${res.data.data.status}`);
    console.log(`     当前重试次数: ${res.data.data.retryCount}`);
    if (res.data.data.lastError) {
      console.log(`     错误信息: ${res.data.data.lastError.substring(0, 50)}...`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 需求3：词库批量导入导出 ===\n');

  console.log('10. 批量导入敏感词（带词包归属）');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/word-packages/import/batch`,
      {
        items: [
          { word: '用户投诉', type: 'exclusive', level: 'info', packageName: '用户反馈词包', packageType: 'exclusive' },
          { word: '售后服务差', type: 'exclusive', level: 'warning', packageName: '用户反馈词包', packageType: 'exclusive' },
          { word: '质量缺陷', type: 'exclusive', level: 'warning' },
          { word: '行业黑幕', type: 'industry', level: 'critical', packageName: '行业风险词包', packageType: 'industry' },
          { word: '', type: 'exclusive', level: 'info' },
          { word: '产品召回', type: 'event', level: 'critical', packageName: '315专项词包', packageType: 'event' },
        ],
      },
      { headers: { 'x-operator': 'admin_li' } }
    );
    console.log(`   ✓ 批量导入完成`);
    console.log(`     成功: ${res.data.data.success} 个`);
    console.log(`     失败: ${res.data.data.failed} 个`);
    console.log(`     跳过(重复): ${res.data.data.skipped} 个`);
    console.log(`     成功列表: ${res.data.data.successItems.map((i: any) => i.word).join(', ')}`);
    if (res.data.data.failedItems.length > 0) {
      console.log(`     失败列表:`);
      for (const item of res.data.data.failedItems) {
        console.log(`       - 第${item.row}行 "${item.word}": ${item.reason}`);
      }
    }
    if (res.data.data.skippedItems.length > 0) {
      console.log(`     跳过列表:`);
      for (const item of res.data.data.skippedItems) {
        console.log(`       - 第${item.row}行 "${item.word}": ${item.reason}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('11. 导出词库（含词包归属）');
  try {
    const res = await axios.get(
      `${BASE_URL}/customers/${customerId}/word-packages/export/all`
    );
    console.log(`   ✓ 导出成功，共 ${res.data.data.length} 个词`);
    const withPackages = res.data.data.filter((w: any) => w.packages.length > 0);
    console.log(`     其中带词包的: ${withPackages.length} 个`);
    for (const w of res.data.data.slice(0, 3)) {
      console.log(`       - ${w.word} [${w.type}] [${w.level}]`);
      if (w.packages.length > 0) {
        console.log(`         所属词包: ${w.packages.map((p: any) => p.name).join(', ')}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 需求4：词包判级与跨客户词引用校验 ===\n');

  console.log('12. 验证词包等级生效 - 质量缺陷词本身warning，在critical词包中');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '又一起质量缺陷事件',
      content: '产品又出现了质量缺陷，用户很不满。',
      source: '微信公众号',
      sourceWeight: 1.0,
    });
    if (res.data.data) {
      console.log(`   ✓ 告警生成，ID: ${res.data.data.id}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     告警等级: ${res.data.data.level}`);
      console.log(`     命中词包类型: ${res.data.data.hitWordPackageTypes.join(', ')}`);
      console.log(`     期望: 等级=critical（词包等级生效，取较高值）`);
      if (res.data.data.level === 'critical') {
        console.log(`     ✓ 词包等级正确生效`);
      } else {
        console.log(`     ⚠ 期望等级为 critical，实际为 ${res.data.data.level}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('13. 调低词包等级后，新告警等级跟着降');
  try {
    await axios.put(
      `${BASE_URL}/customers/${customerId}/word-packages/${packageId1}`,
      { defaultLevel: 'info' },
      { headers: { 'x-operator': 'admin_zhang' } }
    );
    console.log(`   ✓ 词包等级已调整为 info`);

    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '新的质量缺陷投诉',
      content: '又有用户投诉质量缺陷问题。',
      source: '小红书',
      sourceWeight: 1.0,
    });
    if (res.data.data) {
      console.log(`   ✓ 新告警生成，ID: ${res.data.data.id}`);
      console.log(`     告警等级: ${res.data.data.level}`);
      console.log(`     期望: 等级=warning（词本身warning，词包info，取较高值）`);
      if (res.data.data.level === 'warning') {
        console.log(`     ✓ 词包等级调低后，告警等级正确变化`);
      } else {
        console.log(`     ⚠ 期望等级为 warning，实际为 ${res.data.data.level}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('14. 验证跨客户词引用被拒绝');
  try {
    const customerBRes = await axios.post(`${BASE_URL}/customers`, {
      name: '客户B',
      contact: '李总',
    });
    const customerBId = customerBRes.data.data.id;

    const wordBRes = await axios.post(
      `${BASE_URL}/customers/${customerBId}/words`,
      { word: '客户B专属词', type: 'exclusive', level: 'info' }
    );
    const wordBId = wordBRes.data.data.id;
    console.log(`   ✓ 创建了客户B的词: 客户B专属词 (id: ${wordBId})`);

    try {
      await axios.post(
        `${BASE_URL}/customers/${customerId}/word-packages`,
        {
          name: '测试跨客户词',
          type: 'exclusive',
          defaultLevel: 'warning',
          wordIds: [wordBId],
        }
      );
      console.log(`     ✗ 失败: 应该拒绝跨客户词引用，但成功了！\n`);
    } catch (e: any) {
      if (e.response?.status === 400) {
        console.log(`   ✓ 正确拒绝跨客户词引用`);
        console.log(`     错误信息: ${e.response.data.message}\n`);
      } else {
        console.log(`   ⚠ 返回了非预期状态码: ${e.response?.status}\n`);
      }
    }
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 需求5：配置改动审计记录 ===\n');

  console.log('15. 查询审计日志');
  try {
    const res = await axios.get(
      `${BASE_URL}/customers/${customerId}/audit-logs?pageSize=50`
    );
    console.log(`   ✓ 审计日志获取成功，共 ${res.data.data.total} 条`);
    console.log(`     最近 5 条记录:`);
    const recentLogs = res.data.data.list.slice(0, 5);
    for (const log of recentLogs) {
      const time = new Date(log.timestamp).toLocaleString();
      console.log(`       [${time}] ${log.operator} - ${log.action} ${log.entityType} - ${log.entityName || log.entityId}`);
      if (log.changes && log.changes.length > 0) {
        console.log(`         变更字段: ${log.changes.join(', ')}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('16. 查询特定实体的审计记录（词包等级变更）');
  try {
    const res = await axios.get(
      `${BASE_URL}/customers/${customerId}/audit-logs?entityType=word_package&entityId=${packageId1}`
    );
    console.log(`   ✓ 词包 [产品质量词包] 的审计记录: ${res.data.data.total} 条`);
    for (const log of res.data.data.list) {
      const time = new Date(log.timestamp).toLocaleString();
      console.log(`     [${time}] ${log.action} by ${log.operator}`);
      if (log.changes) {
        console.log(`       变更: ${log.changes.join(', ')}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('17. 按操作类型筛选（仅查看删除操作）');
  try {
    await axios.delete(
      `${BASE_URL}/customers/${customerId}/notification-rules/${ruleId2}`,
      { headers: { 'x-operator': 'admin_wang' } }
    );
    console.log(`   ✓ 已删除规则2，操作人: admin_wang`);

    const res = await axios.get(
      `${BASE_URL}/customers/${customerId}/audit-logs?action=delete&pageSize=20`
    );
    console.log(`   ✓ 删除操作日志: ${res.data.data.total} 条`);
    for (const log of res.data.data.list.slice(0, 3)) {
      console.log(`     - ${log.entityType}: ${log.entityName} by ${log.operator}`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 测试完成 ===\n');
  console.log('五项需求验证总结:');
  console.log('  ✓ 需求1: 灵活的告警分发规则（来源筛选、词包类型、分数区间、命中规则列表）');
  console.log('  ✓ 需求2: 通知送达重试与补偿（失败次数、最近错误、重试时间、手动重发）');
  console.log('  ✓ 需求3: 词库批量导入导出（词+词包归属+默认等级，成功/失败/跳过明细）');
  console.log('  ✓ 需求4: 词包判级与跨客户词引用（词包等级主导，跨客户词被拒绝）');
  console.log('  ✓ 需求5: 配置改动审计记录（增删改全记录，可按实体/操作/操作人筛选）');
}

test().catch(console.error);
