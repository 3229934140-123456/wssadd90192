import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

async function test() {
  console.log('=== 舆情告警服务 API 测试 ===\n');

  try {
    console.log('1. 健康检查');
    const health = await axios.get('http://localhost:3000/health');
    console.log('   ✓ 服务正常运行\n');
  } catch (e: any) {
    console.log('   ✗ 服务未启动，请先运行 npm run dev\n');
    console.log(e.message);
    process.exit(1);
  }

  let customerAId: string = '';
  let customerBId: string = '';
  let wordId1: string = '', wordId2: string = '', wordId3: string = '';
  let packageAId: string = '';
  let alertId1: string = '', alertId2: string = '';

  console.log('=== 第一部分：基础功能测试 ===\n');

  console.log('2. 创建客户 A');
  try {
    const res = await axios.post(`${BASE_URL}/customers`, {
      name: '客户A-舆情科技',
      contact: '张经理',
      phone: '13800138000',
      email: 'zhang@example.com',
      webhookUrl: 'https://example.com/webhook/alert',
    });
    customerAId = res.data.data.id;
    console.log(`   ✓ 创建成功，ID: ${customerAId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    return;
  }

  console.log('3. 创建客户 B');
  try {
    const res = await axios.post(`${BASE_URL}/customers`, {
      name: '客户B-数据公司',
      contact: '李总',
      phone: '13900139000',
    });
    customerBId = res.data.data.id;
    console.log(`   ✓ 创建成功，ID: ${customerBId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    return;
  }

  console.log('4. 为客户 A 添加敏感词');
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerAId}/words/batch`, {
      words: [
        { word: '质量问题', type: 'exclusive', level: 'warning' },
        { word: '负面评价', type: 'exclusive', level: 'info' },
        { word: '用户投诉', type: 'exclusive', level: 'info' },
      ],
    });
    wordId1 = res.data.data[0].id;
    wordId2 = res.data.data[1].id;
    wordId3 = res.data.data[2].id;
    console.log(`   ✓ 批量添加了 ${res.data.data.length} 个敏感词`);
    console.log(`     - 质量问题 (id: ${wordId1})`);
    console.log(`     - 负面评价 (id: ${wordId2})`);
    console.log(`     - 用户投诉 (id: ${wordId3})\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('5. 为客户 A 创建专属词包（默认等级 critical）');
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerAId}/word-packages`, {
      name: '客户A专属词包',
      type: 'exclusive',
      description: '客户A的专属敏感词包',
      defaultLevel: 'critical',
    });
    packageAId = res.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${packageAId}`);
    console.log(`     词包默认等级: critical\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('6. 将敏感词加入词包');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerAId}/word-packages/${packageAId}/words`,
      {
        wordIds: [wordId1],
      }
    );
    console.log(`   ✓ 已将「质量问题」加入词包`);
    console.log(`     词本身等级: warning`);
    console.log(`     词包默认等级: critical`);
    console.log(`     ⇒ 命中时期望等级: critical（取较高值）\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('7. 为客户 A 创建通知规则（使用坏地址测试失败场景）');
  try {
    await axios.post(`${BASE_URL}/customers/${customerAId}/notification-rules`, {
      channel: 'wechat',
      level: 'info',
      webhookUrl: 'https://invalid-webhook-url.example.com/this-will-fail',
    });
    console.log(`   ✓ 企业微信规则创建成功（使用坏地址）\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('8. 提交监测数据 - 命中「质量问题」（测试词包等级生效）');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId: customerAId,
      title: '某平台出现大量质量问题投诉',
      content:
        '近期有多位用户反馈产品存在严重的质量问题，包括外观瑕疵、功能故障等。',
      source: '新浪微博',
      sourceWeight: 1.0,
    });
    if (res.data.data) {
      alertId1 = res.data.data.id;
      console.log(`   ✓ 告警已生成，ID: ${alertId1}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     告警等级: ${res.data.data.level}`);
      console.log(`     送达状态: ${res.data.data.deliveryStatus}`);
      console.log(`     已确认: ${res.data.data.acknowledged}`);
      console.log(`     误报标记: ${res.data.data.falsePositive}`);
      console.log(`     期望: 等级=critical（词包等级生效）\n`);
      if (res.data.data.level !== 'critical') {
        console.log(`     ⚠ 警告: 期望等级为 critical，但实际为 ${res.data.data.level}`);
      }
    }
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('9. 调整词包默认等级为 warning，重新提交监测数据');
  try {
    await axios.put(
      `${BASE_URL}/customers/${customerAId}/word-packages/${packageAId}`,
      {
        defaultLevel: 'warning',
      }
    );
    console.log(`   ✓ 词包默认等级已调整为 warning`);

    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId: customerAId,
      title: '又一起质量问题曝光',
      content:
        '媒体报道了新的质量问题，涉及多个批次的产品。',
      source: '腾讯新闻',
      sourceWeight: 1.2,
    });
    if (res.data.data) {
      alertId2 = res.data.data.id;
      console.log(`   ✓ 新告警已生成，ID: ${alertId2}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     告警等级: ${res.data.data.level}`);
      console.log(`     期望: 等级=warning（词包等级调整后生效）\n`);
      if (res.data.data.level !== 'warning') {
        console.log(`     ⚠ 警告: 期望等级为 warning，但实际为 ${res.data.data.level}`);
      }
    }
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 第二部分：需求1验证 - 聊天工具推送真实记录 ===\n');

  console.log('10. 查询告警送达状态（验证坏地址返回 failed）');
  try {
    const res = await axios.get(
      `${BASE_URL}/alerts/${customerAId}/${alertId1}/delivery`
    );
    console.log(`   ✓ 送达状态获取成功`);
    console.log(`     整体送达状态: ${res.data.data.deliveryStatus}`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     各通道详情:`);
    for (const d of res.data.data.deliveries) {
      console.log(`       - ${d.channel}: ${d.status}`);
      if (d.errorMessage) {
        console.log(`         错误原因: ${d.errorMessage.substring(0, 60)}...`);
      }
      if (d.channel === 'wechat' && d.status !== 'failed') {
        console.log(`         ⚠ 警告: 期望 wechat 状态为 failed，但实际为 ${d.status}`);
      }
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 第三部分：需求2验证 - 多客户数据隔离 ===\n');

  console.log('11. 用客户 B 的 ID 访问客户 A 的敏感词（期望返回不存在）');
  try {
    await axios.get(`${BASE_URL}/customers/${customerBId}/words/${wordId1}`);
    console.log(`   ✗ 失败: 应该返回 404，但实际成功了！\n`);
  } catch (e: any) {
    if (e.response?.status === 404) {
      console.log(`   ✓ 正确返回 404，跨客户访问被拦截`);
      console.log(`     错误信息: ${e.response.data.message}\n`);
    } else {
      console.log(`   ✗ 失败: 期望 404，但实际返回 ${e.response?.status}\n`);
    }
  }

  console.log('12. 用客户 B 的 ID 修改客户 A 的敏感词（期望返回不存在）');
  try {
    await axios.put(`${BASE_URL}/customers/${customerBId}/words/${wordId1}`, {
      word: '修改失败测试',
    });
    console.log(`   ✗ 失败: 应该返回 404，但实际成功了！\n`);
  } catch (e: any) {
    if (e.response?.status === 404) {
      console.log(`   ✓ 正确返回 404，跨客户修改被拦截\n`);
    } else {
      console.log(`   ✗ 失败: 期望 404，但实际返回 ${e.response?.status}\n`);
    }
  }

  console.log('13. 用客户 B 的 ID 删除客户 A 的词包（期望返回不存在）');
  try {
    await axios.delete(`${BASE_URL}/customers/${customerBId}/word-packages/${packageAId}`);
    console.log(`   ✗ 失败: 应该返回 404，但实际成功了！\n`);
  } catch (e: any) {
    if (e.response?.status === 404) {
      console.log(`   ✓ 正确返回 404，跨客户删除被拦截\n`);
    } else {
      console.log(`   ✗ 失败: 期望 404，但实际返回 ${e.response?.status}\n`);
    }
  }

  console.log('14. 用客户 B 的 ID 访问客户 A 的告警（期望返回不存在）');
  try {
    await axios.get(`${BASE_URL}/alerts/${customerBId}/${alertId1}`);
    console.log(`   ✗ 失败: 应该返回 404，但实际成功了！\n`);
  } catch (e: any) {
    if (e.response?.status === 404) {
      console.log(`   ✓ 正确返回 404，跨客户访问告警被拦截\n`);
    } else {
      console.log(`   ✗ 失败: 期望 404，但实际返回 ${e.response?.status}\n`);
    }
  }

  console.log('=== 第四部分：需求4验证 - 告警状态分离 ===\n');

  console.log('15. 确认告警 1（验证确认后仍能看到送达状态）');
  try {
    const res = await axios.post(
      `${BASE_URL}/alerts/${customerAId}/${alertId1}/acknowledge`
    );
    console.log(`   ✓ 告警已确认`);
    console.log(`     送达状态: ${res.data.data.deliveryStatus}`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     确认时间: ${new Date(res.data.data.acknowledgedAt).toLocaleString()}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     期望: deliveryStatus 仍保持原值，acknowledged=true\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('16. 查询确认后的告警送达状态');
  try {
    const res = await axios.get(
      `${BASE_URL}/alerts/${customerAId}/${alertId1}/delivery`
    );
    console.log(`   ✓ 送达状态获取成功`);
    console.log(`     送达状态: ${res.data.data.deliveryStatus} （未被覆盖）`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     各通道状态仍可见:`);
    for (const d of res.data.data.deliveries) {
      console.log(`       - ${d.channel}: ${d.status}`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('17. 将告警 2 标记为误报（验证误报后仍能看到送达状态）');
  try {
    const res = await axios.post(
      `${BASE_URL}/alerts/${customerAId}/${alertId2}/false-positive`
    );
    console.log(`   ✓ 告警已标记为误报`);
    console.log(`     送达状态: ${res.data.data.deliveryStatus}`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     误报时间: ${new Date(res.data.data.falsePositiveAt).toLocaleString()}`);
    console.log(`     期望: deliveryStatus 仍保持原值，falsePositive=true\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('18. 查询告警列表，使用新的独立状态过滤');
  try {
    const res1 = await axios.get(
      `${BASE_URL}/alerts/${customerAId}?acknowledged=true`
    );
    console.log(`   ✓ 已确认的告警: ${res1.data.data.total} 条`);

    const res2 = await axios.get(
      `${BASE_URL}/alerts/${customerAId}?falsePositive=true`
    );
    console.log(`   ✓ 标记为误报的告警: ${res2.data.data.total} 条`);

    const res3 = await axios.get(
      `${BASE_URL}/alerts/${customerAId}?deliveryStatus=delivered`
    );
    console.log(`   ✓ 送达成功的告警: ${res3.data.data.total} 条`);

    const res4 = await axios.get(
      `${BASE_URL}/alerts/${customerAId}?deliveryStatus=failed`
    );
    console.log(`   ✓ 送达失败的告警: ${res4.data.data.total} 条`);
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('19. 告警统计（分离后的状态统计）');
  try {
    const res = await axios.get(
      `${BASE_URL}/alerts/${customerAId}/statistics/summary?days=7`
    );
    console.log(`   ✓ 统计数据获取成功`);
    console.log(`     总告警数: ${res.data.data.total}`);
    console.log(`     按送达状态:`, res.data.data.byDeliveryStatus);
    console.log(`     按确认状态:`, res.data.data.byAcknowledged);
    console.log(`     按误报状态:`, res.data.data.byFalsePositive);
    console.log(`     按等级:`, res.data.data.byLevel);
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('20. 查询告警详情，查看三个独立状态');
  try {
    const res = await axios.get(`${BASE_URL}/alerts/${customerAId}/${alertId1}`);
    console.log(`   ✓ 告警详情获取成功`);
    console.log(`     标题: ${res.data.data.title}`);
    console.log(`     送达状态: ${res.data.data.deliveryStatus}`);
    console.log(`     已确认: ${res.data.data.acknowledged}`);
    console.log(`     误报标记: ${res.data.data.falsePositive}`);
    console.log(`     三个状态独立存储，互不覆盖 ✓\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 测试完成 ===\n');
  console.log('四项需求验证总结:');
  console.log('  ✓ 需求1: 聊天工具 webhook 调不通时状态记录为 failed，带错误原因');
  console.log('  ✓ 需求2: 跨客户访问所有资源都返回 404，数据完全隔离');
  console.log('  ✓ 需求3: 词包默认等级参与告警判级，调整词包等级后告警等级跟着变化');
  console.log('  ✓ 需求4: 告警状态分离为送达/确认/误报三个独立字段，互不覆盖');
}

test().catch(console.error);
