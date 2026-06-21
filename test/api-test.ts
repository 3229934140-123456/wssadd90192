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

  let customerId: string;

  console.log('2. 创建客户');
  try {
    const res = await axios.post(`${BASE_URL}/customers`, {
      name: '测试舆情公司',
      contact: '张经理',
      phone: '13800138000',
      email: 'zhang@example.com',
      webhookUrl: 'https://example.com/webhook/alert',
    });
    customerId = res.data.data.id;
    console.log(`   ✓ 创建成功，ID: ${customerId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    return;
  }

  console.log('3. 批量添加敏感词');
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerId}/words/batch`, {
      words: [
        { word: '负面评价', type: 'exclusive', level: 'warning' },
        { word: '质量问题', type: 'exclusive', level: 'critical' },
        { word: '行业丑闻', type: 'industry', level: 'critical' },
        { word: '产品召回', type: 'event', level: 'critical' },
        { word: '用户投诉', type: 'exclusive', level: 'info' },
      ],
    });
    console.log(`   ✓ 批量添加了 ${res.data.data.length} 个敏感词\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('4. 查询敏感词列表');
  try {
    const res = await axios.get(`${BASE_URL}/customers/${customerId}/words`);
    console.log(`   ✓ 共 ${res.data.data.total} 个敏感词`);
    res.data.data.list.forEach((w: any) => {
      console.log(`     - ${w.word} [${w.type}] [${w.level}]`);
    });
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('5. 创建词包 - 专属词包');
  let exclusivePackageId: string;
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerId}/word-packages`, {
      name: '客户专属词包',
      type: 'exclusive',
      description: '客户自定义的专属敏感词',
      defaultLevel: 'warning',
    });
    exclusivePackageId = res.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${exclusivePackageId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('6. 创建词包 - 行业词包');
  let industryPackageId: string;
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerId}/word-packages`, {
      name: '行业通用词包',
      type: 'industry',
      description: '行业通用敏感词',
      defaultLevel: 'warning',
    });
    industryPackageId = res.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${industryPackageId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('7. 创建词包 - 临时事件词包');
  let eventPackageId: string;
  try {
    const res = await axios.post(`${BASE_URL}/customers/${customerId}/word-packages`, {
      name: '315专项词包',
      type: 'event',
      description: '315晚会专项监测词包',
      defaultLevel: 'critical',
    });
    eventPackageId = res.data.data.id;
    console.log(`   ✓ 词包创建成功，ID: ${eventPackageId}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('8. 创建通知规则 - 短信');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/notification-rules`,
      {
        channel: 'sms',
        level: 'critical',
        phoneNumbers: ['13800138000', '13900139000'],
      }
    );
    console.log(`   ✓ 短信通知规则创建成功\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('9. 创建通知规则 - 企业微信');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/notification-rules`,
      {
        channel: 'wechat',
        level: 'warning',
        webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key',
      }
    );
    console.log(`   ✓ 企业微信通知规则创建成功\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('10. 创建通知规则 - 客户系统回调');
  try {
    const res = await axios.post(
      `${BASE_URL}/customers/${customerId}/notification-rules`,
      {
        channel: 'webhook',
        level: 'info',
        webhookUrl: 'https://example.com/api/alert-callback',
      }
    );
    console.log(`   ✓ 客户系统回调规则创建成功\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('11. 提交监测数据 - 命中 critical 级敏感词');
  let alertId: string;
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '某平台出现大量质量问题投诉',
      content:
        '近期有多位用户反馈产品存在严重的质量问题，包括外观瑕疵、功能故障等。部分用户表示已经向相关部门投诉，事件有扩大趋势。',
      source: '新浪微博',
      sourceUrl: 'https://weibo.com/example/12345',
      sourceWeight: 1.5,
      publishTime: Date.now(),
    });
    if (res.data.data) {
      alertId = res.data.data.id;
      console.log(`   ✓ 告警已生成，ID: ${alertId}`);
      console.log(`     等级: ${res.data.data.level}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     告警分数: ${res.data.data.score}`);
      console.log(`     状态: ${res.data.data.status}`);
      console.log(`     推送通道: ${res.data.data.channels.join(', ')}`);
    } else {
      console.log('   - 未命中敏感词');
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('12. 提交监测数据 - 命中 warning 级敏感词');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '用户对服务的负面评价汇总',
      content:
        '本周收集到一些用户的负面评价，主要集中在客服响应速度方面。整体评价偏向负面，但尚未造成大规模影响。',
      source: '知乎',
      sourceUrl: 'https://zhihu.com/example/123',
      sourceWeight: 1.0,
    });
    if (res.data.data) {
      console.log(`   ✓ 告警已生成，ID: ${res.data.data.id}`);
      console.log(`     等级: ${res.data.data.level}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     告警分数: ${res.data.data.score}`);
      console.log(`     推送通道: ${res.data.data.channels.join(', ')}`);
    } else {
      console.log('   - 未命中敏感词');
    }
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('13. 提交监测数据 - 未命中敏感词');
  try {
    const res = await axios.post(`${BASE_URL}/alerts/ingest`, {
      customerId,
      title: '今日市场行情分析报告',
      content: '今日市场整体表现平稳，各行业指数小幅上涨。',
      source: '财经新闻',
      sourceWeight: 0.8,
    });
    console.log(`   ✓ ${res.data.message}\n`);
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('14. 查询告警列表');
  try {
    const res = await axios.get(`${BASE_URL}/alerts/${customerId}`);
    console.log(`   ✓ 共 ${res.data.data.total} 条告警`);
    res.data.data.list.forEach((a: any) => {
      console.log(`     - [${a.level}] ${a.title} | 来源: ${a.source} | 状态: ${a.status}`);
    });
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  if (alertId!) {
    console.log('15. 查询告警详情');
    try {
      const res = await axios.get(`${BASE_URL}/alerts/${customerId}/${alertId}`);
      console.log(`   ✓ 告警详情获取成功`);
      console.log(`     标题: ${res.data.data.title}`);
      console.log(`     命中词: ${res.data.data.hitWords.join(', ')}`);
      console.log(`     推送通道: ${res.data.data.channels.join(', ')}`);
      console.log();
    } catch (e: any) {
      console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    }

    console.log('16. 查询告警送达状态');
    try {
      const res = await axios.get(`${BASE_URL}/alerts/${customerId}/${alertId}/delivery`);
      console.log(`   ✓ 整体状态: ${res.data.data.overallStatus}`);
      res.data.data.deliveries.forEach((d: any) => {
        console.log(`     - ${d.channel}: ${d.status}`);
        if (d.errorMessage) {
          console.log(`       错误: ${d.errorMessage}`);
        }
      });
      console.log();
    } catch (e: any) {
      console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    }

    console.log('17. 确认告警');
    try {
      const res = await axios.post(`${BASE_URL}/alerts/${customerId}/${alertId}/acknowledge`);
      console.log(`   ✓ 告警已确认，当前状态: ${res.data.data.status}\n`);
    } catch (e: any) {
      console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    }

    console.log('18. 标记为误报（用另一条告警测试）');
    try {
      const listRes = await axios.get(`${BASE_URL}/alerts/${customerId}?pageSize=10`);
      if (listRes.data.data.list.length >= 2) {
        const alert2 = listRes.data.data.list[1];
        const res = await axios.post(
          `${BASE_URL}/alerts/${customerId}/${alert2.id}/false-positive`
        );
        console.log(`   ✓ 已标记为误报，当前状态: ${res.data.data.status}`);
      } else {
        console.log('   - 告警数量不足，跳过');
      }
      console.log();
    } catch (e: any) {
      console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
    }
  }

  console.log('19. 告警统计');
  try {
    const res = await axios.get(`${BASE_URL}/alerts/${customerId}/statistics/summary?days=7`);
    console.log(`   ✓ 统计数据获取成功`);
    console.log(`     总告警数: ${res.data.data.total}`);
    console.log(`     按等级:`, res.data.data.byLevel);
    console.log(`     按状态:`, res.data.data.byStatus);
    console.log(`     按来源:`, res.data.data.bySource);
    console.log();
  } catch (e: any) {
    console.log(`   ✗ 失败: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('=== 测试完成 ===');
}

test().catch(console.error);
