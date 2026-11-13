/**
 * Client half of the Superagent monitor bundle.
 *
 * Adds a sidebar entry ("Superagent") and the matching `main` panel. The panel
 * polls the Host route registered by index.js, which reports the standalone
 * dsh-superagent instance, its launchd job, and the plugin sync state between
 * the source profile (this DSH instance) and the target profile (superagent).
 *
 * From the panel the user can start / stop / restart the standalone service and
 * sync plugins into the superagent profile. Every action goes through a Host
 * route that returns immediately with an `operation` document; the panel polls
 * that document until it settles.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-superagent-monitor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-superagent-monitor'
    const ROUTE = '/_dsh/superagent-monitor'
    const REFRESH_MS = 10000
    const FAST_REFRESH_MS = 1500
    const PANEL_KEY = 'superagent-monitor'
    const ENTRY_ORDER = 30
    const PLUGIN_STATES = ['not-synced', 'synced', 'pending-restart', 'active', 'error']
    const OP_ACTIONS = ['start', 'stop', 'restart', 'sync', 'unsync', 'auto-sync']
    const LANG_KEY = 'dsh-superagent-monitor.lang'
    const LANG_COOKIE = 'dsh-superagent-monitor-lang'
    const LANG_IDS = ['zh', 'en']
    const LANG_COOKIE_MAX_AGE = 31536000
    const CHAT_REFRESH_MS = 2000
    const CHAT_IDLE_REFRESH_MS = 10000
    const MAX_CHAT_MESSAGES = 1000
    const CHAT_SIDE_LIMIT = 5
    const CHAT_SOURCES = ['desktop', 'feishu', 'github']
    const CHAT_KINDS = ['message', 'acknowledgement', 'answer', 'result', 'attention', 'notice']
    const CHAT_OUTCOMES = ['accept', 'stop', 'ignore', 'unavailable', 'wouldAccept']
    const CHAT_THREAD_STORAGE = 'dsh-superagent-chat-thread'
    const CHAT_ATTACH_MAX_FILES = 3
    const CHAT_ATTACH_MAX_BYTES = 10 * 1024 * 1024
    const CHAT_ATTACH_TOTAL_BYTES = 25 * 1024 * 1024
    const CHAT_PENDING_LONG_MS = 90000

    const DICT = {
      zh: {
        'nav.title': 'Superagent',
        'panel.title': 'Superagent 管理',
        'panel.subtitle': '监控并控制独立运行的 dsh-superagent：会话主入口、服务启停与插件同步',
        'action.refresh': '刷新',
        'action.openPanel': '打开 Superagent 面板',
        'action.start': '启动',
        'action.stop': '停止',
        'action.restart': '重启',
        'action.restartApply': '重启服务以生效',
        'action.selectUnsynced': '全选未同步',
        'action.clearSelection': '清空',
        'action.syncSelected': '同步所选 ({count})',
        'label.refreshing': '刷新中…',
        'label.updatedAt': '更新于 {time}',
        'label.never': '尚未获取',
        'label.state': '状态',
        'label.pid': '进程',
        'label.url': '地址',
        'label.runs': '运行次数',
        'label.lastExit': '上次退出码',
        'label.interval': '检查间隔',
        'label.loaded': '已加载',
        'label.health': '组件健康',
        'label.problems': '当前问题',
        'label.flow': '近 24 小时流量',
        'label.tickets': '待人处理',
        'label.recent': '最近打开的工单',
        'label.logs': '日志',
        'label.log.agent': 'Superagent 日志',
        'label.log.stdout': 'launchd 标准输出',
        'label.log.stderr': 'launchd 错误输出',
        'label.config': '配置路径',
        'label.workers': '执行器负载',
        'label.plugins': '插件同步',
        'state.loading': '读取中',
        'state.running': '运行中',
        'state.paused': '已暂停',
        'state.stopped': '已停止',
        'state.unreachable': '不可达',
        'state.error': '有错误',
        'state.setup': '等待初始化',
        'state.notRunning': '未运行',
        'state.unknown': '未知',
        'service.waiting': '等待检查',
        'service.notLoaded': '未加载',
        'health.ready': '正常',
        'health.starting': '启动中',
        'health.error': '错误',
        'health.paused': '暂停',
        'health.unknown': '未知',
        'card.service': '后台服务',
        'card.agent': 'Superagent 进程',
        'card.executor': '执行器',
        'card.tickets': '待人处理',
        'hint.service': '{runs} 次运行 · 上次退出 {exit} · 间隔 {interval}',
        'hint.serviceOff': 'launchd 未加载该服务',
        'hint.agent': 'PID {pid} · {url}',
        'hint.executor': '排队 {queued} · 上限 {max}',
        'hint.tickets': '打开的工单共 {total} 个',
        'hint.uncontrollable': '未配置可执行的控制脚本，无法在面板里启停服务',
        'flow.received': '接收',
        'flow.filtered': '过滤',
        'flow.triggers': '触发',
        'flow.judged': '研判',
        'flow.accepted': '受理',
        'flow.evaluating': '研判中',
        'flow.dropped': '丢弃',
        'problem.setup': '等待初始化',
        'problem.no-source': '没有可用来源',
        'problem.no-allowed': '没有允许的发送者',
        'problem.source-error': '来源错误',
        'problem.executor-paused': '执行器已暂停',
        'problem.runtime-error': '运行时错误',
        'problem.eval-overdue': '研判超时',
        'problem.eval-unavailable': '研判不可用',
        'problem.outgoing': '回复发送失败',
        'ticket.person': '待人处理',
        'ticket.working': '执行中',
        'ticket.idle': '空闲',
        'ticket.ended': '已结束',
        'empty.health': '没有组件健康信息。',
        'empty.problems': '没有报告问题。',
        'empty.tickets': '没有待人处理的工单。',
        'empty.recent': '没有打开的工单。',
        'empty.flow': '暂无流量数据。',
        'empty.log': '日志为空。',
        'empty.loading': '正在读取 Superagent 状态…',
        'error.route': '无法连接本机监控接口：{message}',
        'error.agent': 'Superagent 管理接口不可达，显示的是后台服务与日志信息。',
        'error.tickets': '工单列表不可达。',
        'error.action': '操作失败：{message}',
        'error.hostStale': 'Host 半未更新，请重启插件或应用后刷新。',
        'error.plugins': '插件状态读取失败：{message}',
        'title.detail': '详情',
        'plugin.autoSync': '自动同步',
        'plugin.autoSyncHint': '主看板新装插件后自动同步',
        'plugin.restartAfterSync': '安装后自动重启',
        'plugin.restartAfterHint': '同步完成后自动重启服务',
        'plugin.summary': '共 {total} · 生效 {active} · 待重启 {pending} · 失败 {failed}',
        'plugin.unsynced': '未同步 {count}',
        'plugin.lastSync': '最近同步 {time}',
        'plugin.never': '从未同步',
        'plugin.enabled': '已启用',
        'plugin.disabled': '未启用',
        'plugin.state.not-synced': '未同步',
        'plugin.state.synced': '已同步·待安装',
        'plugin.state.pending-restart': '待重启生效',
        'plugin.state.active': '生效中',
        'plugin.state.error': '同步失败',
        'plugin.syncedAt': '同步于 {time}',
        'plugin.specMismatch': '版本与主看板不同，同步会切换版本',
        'plugin.pendingBanner': '{count} 个插件已安装，重启服务后生效。',
        'plugin.empty': '主看板没有可同步的插件。',
        'plugin.unavailable': '插件同步不可用：{message}',
        'plugin.sameProfile': '当前看板就是 superagent 本身，无需同步插件。',
        'tab.settings': '设置',
        'tab.plugins': '插件管理',
        'tab.list': 'Superagent 页面切换',
        'label.serviceControl': '服务控制',
        'hint.serviceControl': '启动、停止或重启独立运行的服务',
        'plugin.noHost': 'Host 半未更新，无法显示插件同步。',
        'plugin.attentionHint': '有待重启或同步失败的插件',
        'plugin.ignore': '忽略',
        'plugin.unignore': '取消忽略',
        'label.ignoredPlugins': '已忽略（{count}）',
        'plugin.ignoredHint': '忽略后不再提示同步，可随时取消',
        'plugin.ignoredCount': '忽略 {count}',
        'plugin.allIgnored': '所有插件都已被忽略，可在下方取消忽略。',
        'lang.switchTo.en': '切换到英文',
        'lang.switchTo.zh': 'Switch to Chinese',
        'confirm.stop': '确定停止 Superagent 服务？正在处理的请求会中断。',
        'confirm.restart': '确定重启 Superagent 服务？重启期间请求会短暂失败。',
        'op.action.start': '启动服务',
        'op.action.stop': '停止服务',
        'op.action.restart': '重启服务',
        'op.action.sync': '同步插件',
        'op.action.unsync': '取消同步',
        'op.action.auto-sync': '自动同步插件',
        'op.status.running': '进行中',
        'op.status.ok': '已完成',
        'op.status.error': '失败',
        'op.names': '{count} 个插件',
        'op.exit': '退出码 {code}',
        'op.log': '运行日志（最近 20 行）',
        'op.emptyLog': '暂无输出。',
        'tab.chat': 'Superagent 会话',
        'chat.load': '执行 {running}/{max} · 排队 {queued}',
        'chat.online': '在线',
        'chat.offline': '离线',
        'chat.loading': '正在读取会话…',
        'chat.dismiss': '关闭',
        'chat.label.online': '状态',
        'chat.label.service': '服务',
        'chat.label.executor': '执行器',
        'chat.side.title': '概览',
        'chat.side.status': '在线状态',
        'chat.side.attention': '待人处理',
        'chat.side.attentionEmpty': '没有待处理的工单。',
        'chat.side.decisions': '最近研判',
        'chat.side.decisionsEmpty': '暂无研判结论。',
        'chat.side.github': 'GitHub 反馈',
        'chat.side.githubEmpty': '暂无 GitHub 工单。',
        'chat.newThread': '＋ 新会话',
        'chat.pending': '已接收，正在等待回复…',
        'chat.pendingLong': '已接收，仍在处理；可在右栏查看研判/工单状态。',
        'chat.input.uploading': '上传中…',
        'chat.attach.add': '附件',
        'chat.attach.remove': '移除',
        'chat.attach.label': '附件',
        'chat.attach.tooMany': '最多 {max} 个附件',
        'chat.attach.tooLarge': '{name} 超过 {size}',
        'chat.attach.tooBig': '附件总大小超过 {size}',
        'chat.attach.uploadFailed': '上传失败：{message}',
        'chat.error.filtered': '消息未被受理：{reason}',
        'chat.error.filteredNoReason': '未说明原因',
        'chat.error.newThread': '新建会话失败',
        'chat.readonly.tickets': '工单与反馈',
        'chat.readonly.noTickets': '该线程暂无关联工单',
        'chat.readonly.question': '待回答：{question}',
        'chat.side.feishu': '飞书状态',
        'chat.side.feishuOff': '未配置',
        'chat.side.feishuOffHint': '配置飞书机器人后，飞书线程会出现在左侧。',
        'chat.side.feishuOn': '{count} 个订阅线程',
        'chat.side.feishuEnabled': '已启用',
        'chat.side.feishuMissing': '未安装',
        'chat.list.title': '会话',
        'chat.list.desktop': '电脑端',
        'chat.list.feishu': '飞书',
        'chat.list.github': 'GitHub',
        'chat.list.emptyDesktop': '暂无电脑端会话',
        'chat.list.emptyFeishu': '暂无飞书线程',
        'chat.list.emptyGithub': '暂无 GitHub 线程',
        'chat.empty.data': '暂无数据',
        'chat.empty.noPlugin': '电脑端会话插件未启用',
        'chat.empty.noPluginHint': '在 superagent 侧安装 @local/dsh-superagent-desktop 并重启服务后可用。',
        'chat.empty.messages': '还没有消息。',
        'chat.empty.messagesHint': '在下面输入，智能体会在 superagent 里受理、执行并回复到这里。',
        'chat.empty.readonly': '该线程还没有可显示的消息。',
        'chat.source.desktop': '电脑端',
        'chat.source.feishu': '飞书',
        'chat.source.github': 'GitHub',
        'chat.thread.untitled': '未命名会话',
        'chat.badge.readonly': '只读',
        'chat.hint.readonly': '只读线程 · 发送即转投到该工单',
        'chat.input.placeholder': '给 superagent 发消息…',
        'chat.input.placeholderRelay': '输入要转投到该工单的内容…',
        'chat.input.send': '发送',
        'chat.input.relay': '转投到该工单',
        'chat.input.sending': '发送中…',
        'chat.input.enterHint': 'Enter 发送 · Shift+Enter 换行',
        'chat.input.relayHint': '转投会把消息交给该线程上进行中的工单，结果仍回到原渠道。',
        'chat.input.offline': '服务离线，暂时无法发送。',
        'chat.scroll.latest': '回到最新',
        'chat.kind.message': '消息',
        'chat.kind.acknowledgement': '确认',
        'chat.kind.answer': '回答',
        'chat.kind.result': '结果',
        'chat.kind.attention': '提问',
        'chat.kind.notice': '通知',
        'chat.role.person': '我',
        'chat.role.agent': '智能体',
        'chat.outcome.accept': '受理',
        'chat.outcome.stop': '停止',
        'chat.outcome.ignore': '忽略',
        'chat.outcome.unavailable': '未完成',
        'chat.outcome.wouldAccept': '本可受理',
        'chat.action.view': '查看',
        'chat.action.stopTicket': '停止',
        'chat.action.open': '打开 ↗',
        'chat.error.overview': '会话读取失败：{message}',
        'chat.error.staleHost': 'Host 半未更新，请重启应用后刷新。',
        'chat.error.partial': '部分区块读取失败：{list}',
        'chat.error.offline': 'Superagent 服务离线，会话只显示已有内容，发送已禁用。',
        'chat.error.thread': '线程读取失败：{message}',
        'chat.error.noDesktop': '电脑端会话插件未启用，无法发送。',
        'chat.confirm.stopTicket': '确定停止该工单？执行器会中断当前工作。',
        'chat.attentionHint': '有会话待处理或读取失败',
      },
      en: {
        'nav.title': 'Superagent',
        'panel.title': 'Superagent manager',
        'panel.subtitle': 'Inspect and control the standalone dsh-superagent: conversation entry, service control and plugin sync',
        'action.refresh': 'Refresh',
        'action.openPanel': 'Open Superagent panel',
        'action.start': 'Start',
        'action.stop': 'Stop',
        'action.restart': 'Restart',
        'action.restartApply': 'Restart service to apply',
        'action.selectUnsynced': 'Select unsynced',
        'action.clearSelection': 'Clear',
        'action.syncSelected': 'Sync selected ({count})',
        'label.refreshing': 'Refreshing…',
        'label.updatedAt': 'Updated {time}',
        'label.never': 'Not loaded yet',
        'label.state': 'State',
        'label.pid': 'Process',
        'label.url': 'Address',
        'label.runs': 'Runs',
        'label.lastExit': 'Last exit code',
        'label.interval': 'Check interval',
        'label.loaded': 'Loaded',
        'label.health': 'Component health',
        'label.problems': 'Current problems',
        'label.flow': 'Last 24 hours',
        'label.tickets': 'Waiting for a person',
        'label.recent': 'Recently opened tickets',
        'label.logs': 'Logs',
        'label.log.agent': 'Superagent log',
        'label.log.stdout': 'launchd stdout',
        'label.log.stderr': 'launchd stderr',
        'label.config': 'Configured paths',
        'label.workers': 'Executor load',
        'label.plugins': 'Plugin sync',
        'state.loading': 'Loading',
        'state.running': 'Running',
        'state.paused': 'Paused',
        'state.stopped': 'Stopped',
        'state.unreachable': 'Unreachable',
        'state.error': 'Has errors',
        'state.setup': 'Waiting for setup',
        'state.notRunning': 'Not running',
        'state.unknown': 'Unknown',
        'service.waiting': 'Between checks',
        'service.notLoaded': 'Not loaded',
        'health.ready': 'Ready',
        'health.starting': 'Starting',
        'health.error': 'Error',
        'health.paused': 'Paused',
        'health.unknown': 'Unknown',
        'card.service': 'Background service',
        'card.agent': 'Superagent process',
        'card.executor': 'Executor',
        'card.tickets': 'Waiting for a person',
        'hint.service': '{runs} runs · exit {exit} · every {interval}',
        'hint.serviceOff': 'launchd does not load this job',
        'hint.agent': 'PID {pid} · {url}',
        'hint.executor': 'Queued {queued} · limit {max}',
        'hint.tickets': '{total} open tickets',
        'hint.uncontrollable': 'No executable control script configured; the service cannot be started or stopped here',
        'flow.received': 'Received',
        'flow.filtered': 'Filtered',
        'flow.triggers': 'Triggers',
        'flow.judged': 'Judged',
        'flow.accepted': 'Accepted',
        'flow.evaluating': 'Evaluating',
        'flow.dropped': 'Dropped',
        'problem.setup': 'Waiting for setup',
        'problem.no-source': 'No source available',
        'problem.no-allowed': 'No allowed sender',
        'problem.source-error': 'Source error',
        'problem.executor-paused': 'Executor paused',
        'problem.runtime-error': 'Runtime error',
        'problem.eval-overdue': 'Evaluation overdue',
        'problem.eval-unavailable': 'Evaluation unavailable',
        'problem.outgoing': 'Reply delivery failed',
        'ticket.person': 'Needs a person',
        'ticket.working': 'Working',
        'ticket.idle': 'Idle',
        'ticket.ended': 'Ended',
        'empty.health': 'No component health reported.',
        'empty.problems': 'Nothing is reported as a problem.',
        'empty.tickets': 'No ticket is waiting for a person.',
        'empty.recent': 'No open tickets.',
        'empty.flow': 'No flow data yet.',
        'empty.log': 'The log is empty.',
        'empty.loading': 'Reading the Superagent state…',
        'error.route': 'The local monitor route is unreachable: {message}',
        'error.agent': 'The Superagent management API is unreachable; service and log facts are shown below.',
        'error.tickets': 'The ticket list is unreachable.',
        'error.action': 'The action failed: {message}',
        'error.hostStale': 'The host half is out of date. Restart the plugin or the app, then refresh.',
        'error.plugins': 'The plugin state could not be read: {message}',
        'title.detail': 'Details',
        'plugin.autoSync': 'Auto-sync',
        'plugin.autoSyncHint': 'Sync plugins newly installed in the source profile',
        'plugin.restartAfterSync': 'Restart after install',
        'plugin.restartAfterHint': 'Restart the service once a sync finishes',
        'plugin.summary': '{total} total · {active} active · {pending} restart pending · {failed} failed',
        'plugin.unsynced': '{count} not active',
        'plugin.lastSync': 'Last sync {time}',
        'plugin.never': 'Never synced',
        'plugin.enabled': 'Enabled',
        'plugin.disabled': 'Disabled',
        'plugin.state.not-synced': 'Not synced',
        'plugin.state.synced': 'Synced · needs install',
        'plugin.state.pending-restart': 'Restart pending',
        'plugin.state.active': 'Active',
        'plugin.state.error': 'Sync failed',
        'plugin.syncedAt': 'Synced {time}',
        'plugin.specMismatch': 'The spec differs from the source profile; syncing switches the version',
        'plugin.pendingBanner': '{count} plugin(s) installed; restart the service to apply.',
        'plugin.empty': 'No syncable plugin in the source profile.',
        'plugin.unavailable': 'Plugin sync is unavailable: {message}',
        'plugin.sameProfile': 'This dashboard is the superagent instance itself; there is nothing to sync.',
        'tab.settings': 'Settings',
        'tab.plugins': 'Plugins',
        'tab.list': 'Superagent page tabs',
        'label.serviceControl': 'Service control',
        'hint.serviceControl': 'Start, stop, or restart the standalone service',
        'plugin.noHost': 'The Host half is not updated, so plugin sync is unavailable.',
        'plugin.attentionHint': 'Some plugins wait for a restart or failed to sync',
        'plugin.ignore': 'Ignore',
        'plugin.unignore': 'Unignore',
        'label.ignoredPlugins': 'Ignored ({count})',
        'plugin.ignoredHint': 'Ignored plugins stop asking to sync; unignore any time',
        'plugin.ignoredCount': 'ignored {count}',
        'plugin.allIgnored': 'Every plugin is ignored; unignore one below.',
        'lang.switchTo.en': 'Switch to English',
        'lang.switchTo.zh': '切换到中文',
        'confirm.stop': 'Stop the Superagent service? Requests in flight will be interrupted.',
        'confirm.restart': 'Restart the Superagent service? Requests will briefly fail during the restart.',
        'op.action.start': 'Start service',
        'op.action.stop': 'Stop service',
        'op.action.restart': 'Restart service',
        'op.action.sync': 'Sync plugins',
        'op.action.unsync': 'Unsync plugins',
        'op.action.auto-sync': 'Auto-sync plugins',
        'op.status.running': 'Running',
        'op.status.ok': 'Done',
        'op.status.error': 'Failed',
        'op.names': '{count} plugin(s)',
        'op.exit': 'exit {code}',
        'op.log': 'Operation log (last 20 lines)',
        'op.emptyLog': 'No output yet.',
        'tab.chat': 'Superagent chat',
        'chat.load': '{running}/{max} running · {queued} queued',
        'chat.online': 'Online',
        'chat.offline': 'Offline',
        'chat.loading': 'Reading the conversation…',
        'chat.dismiss': 'Dismiss',
        'chat.label.online': 'State',
        'chat.label.service': 'Service',
        'chat.label.executor': 'Executor',
        'chat.side.title': 'Overview',
        'chat.side.status': 'Online state',
        'chat.side.attention': 'Waiting for a person',
        'chat.side.attentionEmpty': 'No ticket is waiting for a person.',
        'chat.side.decisions': 'Recent decisions',
        'chat.side.decisionsEmpty': 'No decision yet.',
        'chat.side.github': 'GitHub feedback',
        'chat.side.githubEmpty': 'No GitHub ticket.',
        'chat.newThread': '+ New conversation',
        'chat.pending': 'Received, waiting for a reply…',
        'chat.pendingLong': 'Received and still working; check the assessment/ticket state in the right column.',
        'chat.input.uploading': 'Uploading…',
        'chat.attach.add': 'Attach',
        'chat.attach.remove': 'Remove',
        'chat.attach.label': 'Attachments',
        'chat.attach.tooMany': 'At most {max} attachments',
        'chat.attach.tooLarge': '{name} is larger than {size}',
        'chat.attach.tooBig': 'Attachments exceed {size} in total',
        'chat.attach.uploadFailed': 'Upload failed: {message}',
        'chat.error.filtered': 'The message was not accepted: {reason}',
        'chat.error.filteredNoReason': 'no reason given',
        'chat.error.newThread': 'Could not create a conversation',
        'chat.readonly.tickets': 'Tickets and feedback',
        'chat.readonly.noTickets': 'No ticket is linked to this thread yet',
        'chat.readonly.question': 'Waiting for an answer: {question}',
        'chat.side.feishu': 'Feishu state',
        'chat.side.feishuOff': 'Not configured',
        'chat.side.feishuOffHint': 'Configure the Feishu bot and its threads appear on the left.',
        'chat.side.feishuOn': '{count} subscribed thread(s)',
        'chat.side.feishuEnabled': 'Enabled',
        'chat.side.feishuMissing': 'Not installed',
        'chat.list.title': 'Conversations',
        'chat.list.desktop': 'Desktop',
        'chat.list.feishu': 'Feishu',
        'chat.list.github': 'GitHub',
        'chat.list.emptyDesktop': 'No desktop conversation.',
        'chat.list.emptyFeishu': 'No Feishu thread.',
        'chat.list.emptyGithub': 'No GitHub thread.',
        'chat.empty.data': 'No data yet.',
        'chat.empty.noPlugin': 'The desktop conversation plugin is not enabled',
        'chat.empty.noPluginHint': 'Install @local/dsh-superagent-desktop on the superagent side and restart the service.',
        'chat.empty.messages': 'No message yet.',
        'chat.empty.messagesHint': 'Type below; superagent accepts, runs and answers right here.',
        'chat.empty.readonly': 'This thread has no displayable message yet.',
        'chat.source.desktop': 'Desktop',
        'chat.source.feishu': 'Feishu',
        'chat.source.github': 'GitHub',
        'chat.thread.untitled': 'Untitled conversation',
        'chat.badge.readonly': 'Read-only',
        'chat.hint.readonly': 'Read-only thread · sending relays to its ticket',
        'chat.input.placeholder': 'Message superagent…',
        'chat.input.placeholderRelay': 'What should be relayed to this ticket?',
        'chat.input.send': 'Send',
        'chat.input.relay': 'Relay to the ticket',
        'chat.input.sending': 'Sending…',
        'chat.input.enterHint': 'Enter sends · Shift+Enter adds a line',
        'chat.input.relayHint': 'A relay hands the message to the running ticket of this thread; results still go back to its own channel.',
        'chat.input.offline': 'The service is offline, so nothing can be sent.',
        'chat.scroll.latest': 'Jump to latest',
        'chat.kind.message': 'Message',
        'chat.kind.acknowledgement': 'Ack',
        'chat.kind.answer': 'Answer',
        'chat.kind.result': 'Result',
        'chat.kind.attention': 'Question',
        'chat.kind.notice': 'Notice',
        'chat.role.person': 'Me',
        'chat.role.agent': 'Superagent',
        'chat.outcome.accept': 'Accepted',
        'chat.outcome.stop': 'Stopped',
        'chat.outcome.ignore': 'Ignored',
        'chat.outcome.unavailable': 'Unavailable',
        'chat.outcome.wouldAccept': 'Would accept',
        'chat.action.view': 'View',
        'chat.action.stopTicket': 'Stop',
        'chat.action.open': 'Open ↗',
        'chat.error.overview': 'The conversation could not be read: {message}',
        'chat.error.staleHost': 'The host half is out of date. Restart the app, then refresh.',
        'chat.error.partial': 'Some blocks could not be read: {list}',
        'chat.error.offline': 'Superagent is offline; the conversation only shows what is already known and sending is disabled.',
        'chat.error.thread': 'The thread could not be read: {message}',
        'chat.error.noDesktop': 'The desktop conversation plugin is not enabled, so nothing can be sent.',
        'chat.confirm.stopTicket': 'Stop this ticket? The executor interrupts its current work.',
        'chat.attentionHint': 'A conversation waits for a person, or a block failed to load',
      },
    }

    /* Fallback `t` before the locale service answers (and if it never does). */
    const initialLocale =
      typeof document !== 'undefined' && document.documentElement && /^en(?:-|$)/i.test(document.documentElement.lang || '')
        ? 'en'
        : 'zh'

    function translate(localeId, key, params) {
      const dict = DICT[localeId] || DICT.zh
      let value = (dict && dict[key]) !== undefined ? dict[key] : DICT.en[key] !== undefined ? DICT.en[key] : key
      if (params) {
        Object.keys(params).forEach((name) => {
          value = String(value).replace('{' + name + '}', String(params[name]))
        })
      }
      return value
    }

    function readCookieLanguage() {
      try {
        if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null
        const match = new RegExp('(?:^|; )' + LANG_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)').exec(document.cookie)
        const value = match ? decodeURIComponent(match[1]) : null
        return value === 'zh' || value === 'en' ? value : null
      } catch {
        return null
      }
    }

    function readStoredLanguage() {
      const cookie = readCookieLanguage()
      if (cookie) return cookie
      try {
        if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
        const value = localStorage.getItem(LANG_KEY)
        return value === 'zh' || value === 'en' ? value : null
      } catch {
        return null
      }
    }

    function storeLanguage(value) {
      try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
          if (value) localStorage.setItem(LANG_KEY, value)
          else localStorage.removeItem(LANG_KEY)
        }
      } catch {
        /* Language switching does not depend on storage. */
      }
      try {
        if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
          document.cookie = value
            ? LANG_COOKIE + '=' + encodeURIComponent(value) + '; path=/; max-age=' + LANG_COOKIE_MAX_AGE + '; SameSite=Lax'
            : LANG_COOKIE + '=; path=/; max-age=0; SameSite=Lax'
        }
      } catch {
        /* Language switching does not depend on storage. */
      }
    }

    /* The panel's own language switch; null follows the DSH locale preference. */
    let forcedLanguage = readStoredLanguage()
    let localeService = null
    let boundTranslate = function (key, params) {
      return translate(initialLocale, key, params)
    }
    function t(key, params) {
      return forcedLanguage ? translate(forcedLanguage, key, params) : boundTranslate(key, params)
    }
    function currentLanguage() {
      if (forcedLanguage) return forcedLanguage
      let active = null
      try {
        active = localeService && typeof localeService.getLocale === 'function' ? localeService.getLocale()?.active : null
      } catch {
        active = null
      }
      return active === 'zh' || active === 'en' ? active : initialLocale
    }
    function setForcedLanguage(next) {
      forcedLanguage = LANG_IDS.indexOf(next) >= 0 ? next : null
      storeLanguage(forcedLanguage)
    }

    const stateTone = {
      running: 'ok',
      paused: 'warn',
      setup: 'warn',
      error: 'error',
      stopped: 'idle',
      unreachable: 'error',
      loading: 'idle',
      unknown: 'idle',
    }

    function healthTone(state) {
      if (state === 'ready') return 'ok'
      if (state === 'starting' || state === 'paused') return 'warn'
      if (state === 'error') return 'error'
      return 'idle'
    }

    function pluginStateTone(state) {
      if (state === 'active') return 'ok'
      if (state === 'pending-restart' || state === 'synced') return 'warn'
      if (state === 'error') return 'error'
      return 'idle'
    }

    function opTone(status) {
      if (status === 'error') return 'error'
      if (status === 'running') return 'warn'
      return 'ok'
    }

    function pluginStateLabel(state) {
      return PLUGIN_STATES.indexOf(state) >= 0 ? t('plugin.state.' + state) : state || t('state.unknown')
    }

    function opActionLabel(action) {
      const key = action && OP_ACTIONS.indexOf(action) >= 0 ? action : null
      return key ? t('op.action.' + key) : String(action || t('state.unknown'))
    }

    function statusOf(data) {
      if (!data) return 'loading'
      const agent = data.superagent
      if (!agent) return 'unknown'
      if (agent.reachable) {
        if (agent.setup && agent.setup.problem) return 'setup'
        if (agent.errors && agent.errors.length > 0) return 'error'
        if (agent.paused) return 'paused'
        return 'running'
      }
      if (agent.manuallyStopped) return 'stopped'
      return 'unreachable'
    }

    function formatTime(value) {
      if (!value) return '—'
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
    }

    function baseName(value) {
      return value ? String(value).split('/').pop() : ''
    }

    function toneClass(prefix, tone) {
      return prefix + ' sam-tone-' + tone
    }

    function messageOf(failure) {
      return failure instanceof Error ? failure.message : String(failure)
    }

    function errorFromResult(result) {
      if (result && result.payload && typeof result.payload.error === 'string' && result.payload.error) return result.payload.error
      if (result && result.status) return 'HTTP ' + result.status
      return String(result)
    }

    /** POST JSON to a Host route; never throws for a non-2xx answer. */
    async function postJson(path, body) {
      if (typeof fetch !== 'function') throw new Error('fetch is unavailable')
      const response = await fetch(ROUTE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      return { ok: response.ok, status: response.status, payload }
    }

    /* ---------------------------------------------------------------------- */
    /* Superagent chat tab (CONTRACT-CHAT §4)                                  */
    /* ---------------------------------------------------------------------- */

    /** Only http(s) links are ever rendered (§4.4); everything else is dropped. */
    function safeHref(value) {
      if (!value) return null
      try {
        const url = new URL(String(value))
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
      } catch {
        return null
      }
    }

    function shortTime(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    function chatSourceLabel(source) {
      const key = CHAT_SOURCES.indexOf(source) >= 0 ? source : 'desktop'
      return t('chat.source.' + key)
    }

    function chatKindLabel(kind) {
      const key = CHAT_KINDS.indexOf(kind) >= 0 ? kind : 'message'
      return t('chat.kind.' + key)
    }

    function chatOutcomeLabel(outcome) {
      const key = typeof outcome === 'string' ? outcome : ''
      if (key && CHAT_OUTCOMES.indexOf(key) >= 0) return t('chat.outcome.' + key)
      return key || t('state.unknown')
    }

    function ticketStageLabel(stage) {
      const key = stage === 'person' || stage === 'working' || stage === 'idle' || stage === 'ended' ? stage : null
      return key ? t('ticket.' + key) : String(stage || t('state.unknown'))
    }

    /* Thread keys are `<source>:<id>`; the desktop ones are always `desktop:<id>`. */
    function chatThreadKey(source, id) {
      return String(source || 'desktop') + ':' + String(id === undefined || id === null ? '' : id)
    }

    function chatThreadSource(key) {
      const text = String(key || '')
      const index = text.indexOf(':')
      if (index <= 0) return 'desktop'
      const source = text.slice(0, index)
      return CHAT_SOURCES.indexOf(source) >= 0 ? source : 'desktop'
    }

    function chatThreadRef(key) {
      const text = String(key || '')
      const index = text.indexOf(':')
      return index >= 0 ? text.slice(index + 1) : text
    }

    function chatPreview(value) {
      const raw =
        typeof value === 'string'
          ? value
          : value && typeof value === 'object'
            ? value.text || value.preview || ''
            : ''
      return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    }

    function formatBytes(value) {
      const size = Number(value)
      if (!Number.isFinite(size) || size < 0) return ''
      if (size < 1024) return size + ' B'
      if (size < 1024 * 1024) return (size / 1024).toFixed(1).replace(/\.0$/, '') + ' KB'
      return (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB'
    }

    /* The last picked desktop thread, so a reload lands on the same conversation. */
    function readStoredChatThread() {
      try {
        if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
        const value = localStorage.getItem(CHAT_THREAD_STORAGE)
        return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null
      } catch {
        return null
      }
    }

    function storeChatThread(value) {
      try {
        if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') return
        if (value) localStorage.setItem(CHAT_THREAD_STORAGE, String(value))
        else localStorage.removeItem(CHAT_THREAD_STORAGE)
      } catch {
        /* Persistence is best effort; the panel still works without it. */
      }
    }

    function readFileBase64(file) {
      return new Promise((resolve, reject) => {
        if (typeof FileReader !== 'function') {
          reject(new Error('FileReader is unavailable'))
          return
        }
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('read failed'))
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : ''
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(file)
      })
    }

    /**
     * Local files referenced by an agent message: `file:///abs`, `sandbox:/abs`,
     * a markdown link to an absolute path, or a bare absolute path with an
     * extension. The Host re-checks the whitelist, so a bad path still shows a
     * card and fails at download time (§5.2).
     */
    function localFileRefs(text) {
      const value = typeof text === 'string' ? text : ''
      if (!value) return []
      const out = []
      const seen = new Set()
      const add = (raw, label) => {
        /* Prose separators (`,` `;` and the CJK 「、，。；」 set) end a token. */
        let path = String(raw || '')
          .trim()
          .replace(/^<(.*)>$/, '$1')
          .replace(/[,;.),.;、，。；]+$/, '')
        if (!path) return
        path = path.replace(/^file:\/\//i, '').replace(/^sandbox:/i, '')
        if (path.startsWith('//')) path = path.slice(2)
        if (!path.startsWith('/')) return
        if (path.includes('://')) return
        if (!/\.[A-Za-z0-9]{1,12}$/.test(path)) return
        if (seen.has(path)) return
        seen.add(path)
        out.push({ path, name: path.split('/').pop() || path, label: String(label || '') })
      }
      let match
      const markdown = /\[([^\]\n]*)\]\(([^)\n]+)\)/g
      while ((match = markdown.exec(value)) !== null) add(match[2], match[1])
      /* `、` and `,` separate paths, so they cannot belong to a bare token;
         the extension check then sees each path on its own. */
      const bare = /(?:^|[\s(（「"'：:、，。;；,])((?:file:\/\/\/|sandbox:\/|\/)[^\s)\]"'<>，。；、：,;]+)/g
      while ((match = bare.exec(value)) !== null) add(match[1])
      return out.slice(0, 8)
    }

    /* A read-only (feishu/github) thread detail: `timeline[]` actors become bubbles. */
    function timelineEntries(detail) {
      if (!detail || typeof detail !== 'object') return []
      const list = Array.isArray(detail.timeline)
        ? detail.timeline
        : Array.isArray(detail.messages)
          ? detail.messages
          : detail.messages && Array.isArray(detail.messages.items)
            ? detail.messages.items
            : []
      return list
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
          const actor = item.actor && typeof item.actor === 'object' ? item.actor : null
          const role =
            item.role === 'agent' || item.role === 'person' ? item.role : actor && actor.kind === 'agent' ? 'agent' : 'person'
          const text =
            typeof item.text === 'string' ? item.text : typeof item.body === 'string' ? item.body : ''
          return {
            id: item.id !== undefined && item.id !== null ? String(item.id) : 'timeline-' + index,
            kind: typeof item.kind === 'string' ? item.kind : 'message',
            role,
            actorName: actor && (actor.name || actor.id) ? String(actor.name || actor.id) : '',
            at: item.at || item.createdAt || null,
            text,
          }
        })
        .filter((item) => item.text)
    }

    /**
     * The chat tab's single data source: `GET /chat/overview?thread=<selected>`.
     * Polls every 2s while visible, merges desktop messages by id, replaces the
     * other blocks wholesale and keeps the last good snapshot on failure.
     */
    function useChatFeed(pageActive) {
      const [overview, setOverview] = React.useState(null)
      const [overviewError, setOverviewError] = React.useState(null)
      const [stale, setStale] = React.useState(false)
      const [loadedAt, setLoadedAt] = React.useState(0)
      const [busy, setBusy] = React.useState(false)
      const [selected, setSelected] = React.useState(null)
      const [messages, setMessages] = React.useState([])
      const [detail, setDetail] = React.useState(null)
      const [detailError, setDetailError] = React.useState(null)
      const [detailTick, setDetailTick] = React.useState(0)
      const [sending, setSending] = React.useState(false)
      const [uploading, setUploading] = React.useState(false)
      const [creating, setCreating] = React.useState(false)
      const [filteredId, setFilteredId] = React.useState(null)
      const [actionError, setActionError] = React.useState(null)
      const abortRef = React.useRef(null)
      const seenRef = React.useRef(new Set())
      const threadRef = React.useRef(null)
      const sendingRef = React.useRef(false)
      const storedThreadRef = React.useRef(readStoredChatThread())
      const queryRef = React.useRef(storedThreadRef.current || 'main')
      const selectedRef = React.useRef(null)
      const lastQueryRef = React.useRef(null)
      const detailKeyRef = React.useRef(null)
      const activeRef = React.useRef(pageActive !== false)
      const wasActiveRef = React.useRef(pageActive !== false)
      activeRef.current = pageActive !== false

      /* The overview is always queried with the selected *desktop* thread. */
      const desktopThread =
        selected && chatThreadSource(selected) === 'desktop'
          ? chatThreadRef(selected)
          : overview && overview.desktop && typeof overview.desktop.thread === 'string' && overview.desktop.thread
            ? overview.desktop.thread
            : storedThreadRef.current || 'main'
      queryRef.current = desktopThread
      selectedRef.current = selected

      const load = React.useCallback(async (threadId) => {
        const target = String(threadId || 'main')
        if (abortRef.current) abortRef.current.abort()
        const controller = new AbortController()
        abortRef.current = controller
        try {
          const response = await fetch(ROUTE + '/chat/overview?thread=' + encodeURIComponent(target), {
            method: 'GET',
            headers: { accept: 'application/json' },
            signal: controller.signal,
          })
          let payload = null
          try {
            payload = await response.json()
          } catch {
            payload = null
          }
          if (!response.ok) {
            if (response.status === 404) setStale(true)
            throw new Error((payload && typeof payload.error === 'string' && payload.error) || 'HTTP ' + response.status)
          }
          const shaped =
            payload &&
            typeof payload === 'object' &&
            (Object.prototype.hasOwnProperty.call(payload, 'online') ||
              Object.prototype.hasOwnProperty.call(payload, 'desktop'))
          if (!shaped || payload.ok === false) {
            if (!shaped) setStale(true)
            throw new Error(
              shaped && typeof payload.error === 'string' && payload.error ? payload.error : t('chat.error.staleHost'),
            )
          }
          setStale(false)
          setOverview(payload)
          setOverviewError(null)
          setLoadedAt(Date.now())
          const desk = payload.desktop && typeof payload.desktop === 'object' ? payload.desktop : null
          const list =
            desk && Array.isArray(desk.messages)
              ? desk.messages.filter(
                  (item) => item && typeof item === 'object' && item.id !== undefined && item.id !== null,
                )
              : []
          const threadOfPayload = desk && typeof desk.thread === 'string' && desk.thread ? desk.thread : target
          if (threadRef.current !== threadOfPayload) {
            /* A different thread: start the feed over. */
            threadRef.current = threadOfPayload
            const seen = new Set()
            list.forEach((item) => seen.add(String(item.id)))
            seenRef.current = seen
            setMessages(list.length > MAX_CHAT_MESSAGES ? list.slice(list.length - MAX_CHAT_MESSAGES) : list)
          } else if (list.length > 0) {
            setMessages((previous) => {
              const seen = seenRef.current
              const additions = []
              list.forEach((item) => {
                const id = String(item.id)
                if (seen.has(id)) return
                seen.add(id)
                additions.push(item)
              })
              if (additions.length === 0) return previous
              const next = previous.concat(additions)
              return next.length > MAX_CHAT_MESSAGES ? next.slice(next.length - MAX_CHAT_MESSAGES) : next
            })
          }
        } catch (failure) {
          if (failure && failure.name === 'AbortError') return
          /* Keep the last good snapshot; only surface a banner. */
          setOverviewError(messageOf(failure))
        } finally {
          if (abortRef.current === controller) abortRef.current = null
        }
      }, [])

      /* 2s poll, paused while the document is hidden, immediate on visibility. */
      React.useEffect(() => {
        let active = true
        let timer
        const tick = async () => {
          if (!active) return
          if (typeof document === 'undefined' || !document.hidden) await load(queryRef.current)
          if (active) timer = setTimeout(tick, activeRef.current ? CHAT_REFRESH_MS : CHAT_IDLE_REFRESH_MS)
        }
        const onVisible = () => {
          if (typeof document !== 'undefined' && !document.hidden && active) void load(queryRef.current)
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
        timer = setTimeout(tick, 0)
        return () => {
          active = false
          clearTimeout(timer)
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
          if (abortRef.current) abortRef.current.abort()
        }
      }, [load])

      /* Returning to the chat page refreshes at once instead of waiting for the timer. */
      React.useEffect(() => {
        const wasActive = wasActiveRef.current
        wasActiveRef.current = activeRef.current
        if (activeRef.current && !wasActive) void load(queryRef.current)
      }, [pageActive, load])

      /* Switching the desktop thread refreshes at once (the first load is the poll's). */
      React.useEffect(() => {
        if (lastQueryRef.current === desktopThread) return
        const first = lastQueryRef.current === null
        lastQueryRef.current = desktopThread
        if (first) return
        void load(desktopThread)
      }, [desktopThread, load])

      /* Pick the desktop thread advertised by the snapshot once it arrives. */
      React.useEffect(() => {
        if (selected) return
        const desk = overview && overview.desktop && typeof overview.desktop === 'object' ? overview.desktop : null
        if (!desk || desk.available === false) return
        const list = Array.isArray(desk.threads) ? desk.threads.filter((item) => item && item.id !== undefined && item.id !== null) : []
        const stored = readStoredChatThread()
        if (stored && list.some((item) => String(item.id) === String(stored))) {
          setSelected(chatThreadKey('desktop', stored))
          return
        }
        if (stored && list.length > 0) storeChatThread(null)
        const advertised = typeof desk.thread === 'string' && desk.thread ? desk.thread : null
        const known = advertised && list.some((item) => String(item.id) === advertised) ? advertised : null
        const id = known || (list.length > 0 ? list[0].id : advertised)
        if (id !== null && id !== undefined) setSelected(chatThreadKey('desktop', id))
      }, [overview, selected])

      /* A read-only thread pulls its detail through `/chat/thread`. */
      React.useEffect(() => {
        if (!selected || chatThreadSource(selected) === 'desktop') {
          detailKeyRef.current = null
          setDetail(null)
          setDetailError(null)
          return undefined
        }
        if (detailKeyRef.current !== selected) {
          detailKeyRef.current = selected
          setDetail(null)
          setDetailError(null)
        }
        let active = true
        const controller = new AbortController()
        void (async () => {
          try {
            const response = await fetch(ROUTE + '/chat/thread?key=' + encodeURIComponent(selected), {
              method: 'GET',
              headers: { accept: 'application/json' },
              signal: controller.signal,
            })
            let payload = null
            try {
              payload = await response.json()
            } catch {
              payload = null
            }
            if (!response.ok || (payload && payload.ok === false)) {
              throw new Error(
                (payload && typeof payload.error === 'string' && payload.error) || 'HTTP ' + response.status,
              )
            }
            if (!active) return
            setDetail(payload && payload.thread && typeof payload.thread === 'object' ? payload.thread : payload)
            setDetailError(null)
          } catch (failure) {
            if (!active || (failure && failure.name === 'AbortError')) return
            setDetailError(messageOf(failure))
          }
        })()
        return () => {
          active = false
          controller.abort()
        }
      }, [selected, detailTick])

      const run = React.useCallback(async (path, body) => {
        if (sendingRef.current) return { ok: false, payload: null }
        sendingRef.current = true
        setSending(true)
        setActionError(null)
        try {
          const result = await postJson(path, body)
          if (!result.ok) {
            setActionError(errorFromResult(result))
            return { ok: false, payload: result.payload }
          }
          return { ok: true, payload: result.payload }
        } catch (failure) {
          setActionError(messageOf(failure))
          return { ok: false, payload: null }
        } finally {
          sendingRef.current = false
          setSending(false)
        }
      }, [])

      /* Upload each picked file, then hand the returned ids to `/chat/send`. */
      const uploadFiles = React.useCallback(async (files) => {
        const list = Array.isArray(files) ? files.filter(Boolean) : []
        if (list.length === 0) return []
        setActionError(null)
        setUploading(true)
        try {
          const metas = []
          for (const file of list) {
            const data = await readFileBase64(file)
            const result = await postJson('/chat/upload', {
              name: file.name || 'file',
              type: file.type || '',
              data,
            })
            if (!result.ok) {
              setActionError(t('chat.attach.uploadFailed', { message: errorFromResult(result) }))
              return null
            }
            const attachment =
              result.payload && result.payload.attachment && typeof result.payload.attachment === 'object'
                ? result.payload.attachment
                : null
            if (!attachment || attachment.id === undefined || attachment.id === null) {
              setActionError(t('chat.attach.uploadFailed', { message: 'HTTP ' + result.status }))
              return null
            }
            metas.push({
              id: String(attachment.id),
              name: attachment.name || file.name || '',
              size: typeof attachment.size === 'number' ? attachment.size : file.size,
              type: attachment.type || file.type || '',
            })
          }
          return metas
        } catch (failure) {
          setActionError(t('chat.attach.uploadFailed', { message: messageOf(failure) }))
          return null
        } finally {
          setUploading(false)
        }
      }, [])

      const send = React.useCallback(
        async (text, attachmentItems) => {
          const items = Array.isArray(attachmentItems) ? attachmentItems.filter(Boolean) : []
          const files = items.map((item) => item.file).filter(Boolean)
          let metas = []
          if (files.length > 0) {
            metas = await uploadFiles(files)
            if (!metas) return { ok: false, payload: null }
          }
          const body = { text: String(text === undefined || text === null ? '' : text) }
          if (queryRef.current) body.thread = queryRef.current
          if (metas.length > 0) body.attachments = metas
          const result = await run('/chat/send', body)
          if (result.ok) {
            const payload = result.payload && typeof result.payload === 'object' ? result.payload : null
            const receive = payload && payload.receive && typeof payload.receive === 'object' ? payload.receive : null
            if (receive && receive.status === 'filtered') {
              /* Rejected before it could ever be answered: say so and never wait forever. */
              const reason = typeof receive.reason === 'string' && receive.reason ? receive.reason : ''
              setActionError(t('chat.error.filtered', { reason: reason || t('chat.error.filteredNoReason') }))
              const message = payload.message && typeof payload.message === 'object' ? payload.message : null
              setFilteredId(message && message.id !== undefined && message.id !== null ? String(message.id) : null)
            } else {
              setFilteredId(null)
            }
            await load(queryRef.current)
          }
          return result
        },
        [run, load, uploadFiles],
      )

      const relay = React.useCallback(
        async (text) => {
          const target = selectedRef.current
          if (!target) return { ok: false, payload: null }
          const result = await run('/chat/relay', { target, text: String(text) })
          if (result.ok) {
            await load(queryRef.current)
            setDetailTick((value) => value + 1)
          }
          return result
        },
        [run, load],
      )

      const select = React.useCallback((key) => {
        const next = key || null
        setSelected(next)
        if (next && chatThreadSource(next) === 'desktop') storeChatThread(chatThreadRef(next))
      }, [])

      const createThread = React.useCallback(async () => {
        if (sendingRef.current) return null
        sendingRef.current = true
        setCreating(true)
        setActionError(null)
        try {
          const result = await postJson('/chat/threads', {})
          if (!result.ok) {
            setActionError(errorFromResult(result))
            return null
          }
          const thread =
            result.payload && result.payload.thread && typeof result.payload.thread === 'object'
              ? result.payload.thread
              : null
          const id = thread && thread.id !== undefined && thread.id !== null ? String(thread.id) : ''
          if (!id) {
            setActionError(t('chat.error.newThread'))
            return null
          }
          storeChatThread(id)
          setSelected(chatThreadKey('desktop', id))
          await load(id)
          return thread
        } catch (failure) {
          setActionError(messageOf(failure))
          return null
        } finally {
          sendingRef.current = false
          setCreating(false)
        }
      }, [load])

      const stopTicket = React.useCallback(
        async (id) => {
          const ticketId = String(id || '')
          if (!ticketId) return
          const question = t('chat.confirm.stopTicket')
          const agreed =
            typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(question) : true
          if (!agreed) return
          const result = await run('/chat/ticket/' + encodeURIComponent(ticketId) + '/stop', {})
          if (result.ok) await load(queryRef.current)
        },
        [run, load],
      )

      const refresh = React.useCallback(async () => {
        setBusy(true)
        try {
          await load(queryRef.current)
          if (selectedRef.current && chatThreadSource(selectedRef.current) !== 'desktop') {
            setDetailTick((value) => value + 1)
          }
        } finally {
          setBusy(false)
        }
      }, [load])

      return {
        overview,
        overviewError,
        stale,
        busy,
        loadedAt,
        selected,
        select,
        messages,
        threadDetail: detail,
        threadDetailError: detailError,
        sending,
        uploading,
        creating,
        filteredId,
        actionError,
        refresh,
        send,
        relay,
        createThread,
        stopTicket,
        clearOverviewError: () => setOverviewError(null),
        clearActionError: () => setActionError(null),
      }
    }

    function ChatStatusBar(props) {
      return h(
        'div',
        { className: 'sam-chat-bar' },
        h(
          'span',
          { className: 'sam-chat-bar-status ' + 'sam-tone-' + (props.online ? 'ok' : 'error') },
          h('span', { className: 'sam-dot' }),
          props.online ? t('chat.online') : t('chat.offline'),
        ),
        h('span', { className: 'sam-chat-bar-meta' }, t('chat.load', props.load)),
        h(
          'span',
          { className: 'sam-chat-bar-meta' },
          props.updatedAt
            ? t('label.updatedAt', { time: new Date(props.updatedAt).toLocaleTimeString() })
            : t('label.never'),
        ),
      )
    }

    function ChatGroup(props) {
      return h(
        'div',
        { className: 'sam-chat-group' },
        h(
          'div',
          { className: 'sam-chat-group-head' },
          h('div', { className: 'sam-chat-group-label' }, props.label),
          props.action || null,
        ),
        props.rows && props.rows.length > 0
          ? props.rows
          : h('p', { className: 'sam-chat-group-empty' }, props.empty),
      )
    }

    function ChatThreadRow(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'sam-chat-item' + (props.active ? ' sam-chat-item-active' : ''),
          onClick: () => props.onSelect(props.threadKey),
          'aria-pressed': Boolean(props.active),
          title: props.title || '',
        },
        h(
          'span',
          { className: 'sam-chat-item-top' },
          h('span', { className: 'sam-chat-source' }, chatSourceLabel(props.source)),
          h('span', { className: 'sam-chat-item-title' }, props.title),
          props.time ? h('span', { className: 'sam-chat-item-time' }, props.time) : null,
        ),
        h('span', { className: 'sam-chat-item-preview' }, props.preview || ''),
      )
    }

    function ChatAttachCard(props) {
      return h(
        'a',
        {
          className: 'sam-chat-attach',
          href: props.href,
          target: '_blank',
          rel: 'noreferrer',
          title: props.title || props.name || '',
        },
        h('span', { className: 'sam-chat-attach-name' }, props.name),
        props.meta ? h('span', { className: 'sam-chat-attach-meta' }, props.meta) : null,
      )
    }

    function ChatBubble(props) {
      const message = props.message || {}
      const role = message.role === 'agent' ? 'agent' : 'person'
      const text = typeof message.text === 'string' ? message.text : String(message.text || '')
      const author = message.actorName || (role === 'agent' ? t('chat.role.agent') : t('chat.role.person'))
      /* Uploaded files on the message itself (§2). */
      const files = Array.isArray(message.attachments)
        ? message.attachments.filter((item) => item && typeof item === 'object' && item.id !== undefined && item.id !== null)
        : []
      /* Local files the agent mentions in its text (§5.2). */
      const refs = role === 'agent' && !props.readOnly ? localFileRefs(text) : []
      return h(
        'div',
        { className: 'sam-chat-msg sam-chat-msg-' + role },
        h(
          'div',
          { className: 'sam-chat-msg-meta' },
          h('span', { className: 'sam-chat-kind' }, chatKindLabel(message.kind)),
          h('span', null, author),
          message.at ? h('span', null, shortTime(message.at)) : null,
        ),
        h(
          'div',
          { className: 'sam-chat-bubble' },
          text ? h('span', { className: 'sam-chat-bubble-text' }, text) : null,
          files.length > 0
            ? h(
                'div',
                { className: 'sam-chat-attachments' },
                files.map((item) =>
                  h(ChatAttachCard, {
                    key: 'file-' + String(item.id),
                    name: item.name || String(item.id),
                    meta: formatBytes(item.size),
                    title: item.name || '',
                    href: ROUTE + '/chat/file?attachment=' + encodeURIComponent(String(item.id)),
                  }),
                ),
              )
            : null,
          refs.length > 0
            ? h(
                'div',
                { className: 'sam-chat-attachments' },
                refs.map((ref) =>
                  h(ChatAttachCard, {
                    key: 'ref-' + ref.path,
                    name: ref.label || ref.name,
                    meta: ref.path,
                    title: ref.path,
                    href: ROUTE + '/chat/file?path=' + encodeURIComponent(ref.path),
                  }),
                ),
              )
            : null,
        ),
      )
    }

    function ChatComposer(props) {
      const chips = Array.isArray(props.attachments) ? props.attachments : []
      return h(
        'div',
        { className: 'sam-chat-compose' },
        props.readOnly
          ? null
          : h(
              'div',
              { className: 'sam-chat-attach-row' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button sam-chat-attach-btn',
                  onClick: props.onPickFiles,
                  disabled: Boolean(props.disabled) || Boolean(props.uploading),
                  title: t('chat.attach.add'),
                },
                t('chat.attach.add'),
              ),
              h('input', {
                type: 'file',
                multiple: true,
                className: 'sam-chat-file',
                ref: props.fileRef,
                onChange: props.onFilesChange,
                tabIndex: -1,
                'aria-hidden': true,
              }),
              chips.length > 0
                ? h(
                    'div',
                    { className: 'sam-chat-chips' },
                    chips.map((item) =>
                      h(
                        'span',
                        { key: item.key, className: 'sam-chat-chip' },
                        h('span', { className: 'sam-chat-chip-name', title: item.name }, item.name),
                        h('span', { className: 'sam-chat-chip-size' }, formatBytes(item.size)),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'sam-chat-chip-remove',
                            onClick: () => props.onRemoveAttachment(item.key),
                            title: t('chat.attach.remove'),
                            'aria-label': t('chat.attach.remove'),
                            disabled: Boolean(props.sending) || Boolean(props.uploading),
                          },
                          '×',
                        ),
                      ),
                    ),
                  )
                : null,
            ),
        props.attachError
          ? h('div', { className: 'sam-chat-hint sam-tone-error' }, props.attachError)
          : null,
        h(
          'div',
          { className: 'sam-chat-row' },
          h('textarea', {
            className: 'sam-chat-input',
            value: props.value,
            rows: 2,
            placeholder: props.placeholder,
            'aria-label': props.placeholder,
            disabled: Boolean(props.disabled),
            onChange: (event) => props.onChange(event.target.value),
            onKeyDown: props.onKeyDown,
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'sam-chat-send',
              onClick: props.onSend,
              disabled: Boolean(props.disabled) || !props.canSend,
            },
            props.uploading
              ? t('chat.input.uploading')
              : props.sending
                ? t('chat.input.sending')
                : props.label,
          ),
        ),
        props.hint ? h('div', { className: 'sam-chat-hint' }, props.hint) : null,
      )
    }

    function ChatTab(props) {
      const [draft, setDraft] = React.useState('')
      const [stick, setStick] = React.useState(true)
      const [attachments, setAttachments] = React.useState([])
      const [attachError, setAttachError] = React.useState(null)
      const [clock, setClock] = React.useState(() => Date.now())
      const streamRef = React.useRef(null)
      const fileInputRef = React.useRef(null)

      const overview = props.overview || null
      const selected = props.selected || null
      const source = chatThreadSource(selected)
      const readOnly = Boolean(selected) && source !== 'desktop'
      const desktop = overview && overview.desktop && typeof overview.desktop === 'object' ? overview.desktop : null
      const desktopAvailable = Boolean(desktop) && desktop.available !== false
      const online = Boolean(overview && overview.online)
      const service = overview && overview.service && typeof overview.service === 'object' ? overview.service : null
      const serviceState = service && typeof service.state === 'string' && service.state ? service.state : 'unknown'
      const running = service && service.running !== undefined && service.running !== null ? service.running : '—'
      const maxWorkers = service && service.maxWorkers !== undefined && service.maxWorkers !== null ? service.maxWorkers : '—'
      const queued = service && service.queued !== undefined && service.queued !== null ? service.queued : '—'
      const tickets = overview && Array.isArray(overview.tickets) ? overview.tickets : null
      const threads = overview && Array.isArray(overview.threads) ? overview.threads : null
      const decisions = overview && Array.isArray(overview.decisions) ? overview.decisions : null
      const errors = overview && Array.isArray(overview.errors) ? overview.errors : []
      const feishu = overview && overview.feishu && typeof overview.feishu === 'object' ? overview.feishu : null
      const desktopThreads =
        desktop && Array.isArray(desktop.threads) ? desktop.threads.filter((item) => item && typeof item === 'object') : null
      const feishuThreads = threads ? threads.filter((item) => item && item.source === 'feishu') : null
      const githubThreads = threads ? threads.filter((item) => item && item.source === 'github') : null
      const currentThread =
        readOnly && threads
          ? threads.find(
              (item) => item && (item.key === selected || chatThreadKey(item.source, item.id) === selected),
            ) || null
          : null
      const desktopThread =
        !readOnly && desktopThreads
          ? desktopThreads.find((item) => chatThreadKey('desktop', item.id) === selected) || null
          : null
      const currentTitle = readOnly
        ? (currentThread && (currentThread.title || currentThread.key)) ||
          chatThreadRef(selected) ||
          t('chat.thread.untitled')
        : (desktopThread && (desktopThread.title || desktopThread.id)) ||
          (desktop && desktop.thread ? String(desktop.thread) : '') ||
          t('chat.thread.untitled')
      const messages = readOnly ? timelineEntries(props.threadDetail) : Array.isArray(props.messages) ? props.messages : []
      const canWrite = online && desktopAvailable
      /* A read-only thread's timeline is inbound triggers only: its tickets carry
         the agent's feedback (stage/summary/attention/question/link). */
      const readOnlyDetail = readOnly && props.threadDetail && typeof props.threadDetail === 'object' ? props.threadDetail : null
      const readOnlyTickets =
        readOnlyDetail && Array.isArray(readOnlyDetail.tickets)
          ? readOnlyDetail.tickets.filter((item) => item && typeof item === 'object')
          : []

      /* A person message with no agent answer yet: derive the wait from history (§5.1). */
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
      const pendingCandidate = Boolean(!readOnly && lastMessage && lastMessage.role === 'person')
      const pendingSuppressed = Boolean(
        pendingCandidate &&
          props.filteredId !== null &&
          props.filteredId !== undefined &&
          String(lastMessage.id) === String(props.filteredId),
      )
      const showPending = pendingCandidate && !pendingSuppressed
      const pendingAt = showPending && lastMessage && lastMessage.at ? new Date(lastMessage.at).getTime() : 0
      const pendingLong = showPending && Number.isFinite(pendingAt) && pendingAt > 0 && clock - pendingAt > CHAT_PENDING_LONG_MS

      React.useEffect(() => {
        if (!showPending) return undefined
        const timer = setInterval(() => setClock(Date.now()), 5000)
        return () => clearInterval(timer)
      }, [showPending])

      const rowsOf = (list, sourceName) =>
        (list || []).map((thread) => {
          const key =
            sourceName === 'desktop'
              ? chatThreadKey('desktop', thread.id)
              : thread.key || chatThreadKey(thread.source || sourceName, thread.id)
          return h(ChatThreadRow, {
            key,
            threadKey: key,
            active: selected === key,
            source: sourceName,
            title: thread.title || thread.key || thread.id || t('chat.thread.untitled'),
            preview: chatPreview(thread.preview || thread.latest || thread.note),
            time: shortTime(thread.lastAt || (thread.latest && thread.latest.at)),
            onSelect: props.onSelect,
          })
        })

      const desktopEmpty = !desktopAvailable
        ? t('chat.empty.noPlugin')
        : desktopThreads === null
          ? t('chat.empty.data')
          : t('chat.list.emptyDesktop')

      let emptyBody = null
      if (!overview) emptyBody = h('p', { className: 'sam-chat-empty' }, t('chat.loading'))
      else if (readOnly && props.threadDetailError)
        emptyBody = h('p', { className: 'sam-chat-empty' }, t('chat.error.thread', { message: props.threadDetailError }))
      else if (!readOnly && !desktopAvailable)
        emptyBody = h(
          'div',
          { className: 'sam-chat-empty' },
          h('strong', null, t('chat.empty.noPlugin')),
          h('span', null, t('chat.empty.noPluginHint')),
        )
      else if (!online) emptyBody = h('p', { className: 'sam-chat-empty' }, t('chat.error.offline'))
      else if (readOnly && !props.threadDetail) emptyBody = h('p', { className: 'sam-chat-empty' }, t('chat.loading'))
      else if (readOnly) emptyBody = h('p', { className: 'sam-chat-empty' }, t('chat.empty.readonly'))
      else
        emptyBody = h(
          'div',
          { className: 'sam-chat-empty' },
          h('span', null, t('chat.empty.messages')),
          h('span', null, t('chat.empty.messagesHint')),
        )

      React.useEffect(() => {
        const element = streamRef.current
        if (!element || !stick) return
        element.scrollTop = element.scrollHeight
      }, [messages.length, stick, selected, readOnly])

      const jump = () => {
        setStick(true)
        const element = streamRef.current
        if (element) element.scrollTop = element.scrollHeight
      }

      const onScroll = () => {
        const element = streamRef.current
        if (!element) return
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight
        setStick(distance < 48)
      }

      const pickFiles = () => {
        if (fileInputRef.current && typeof fileInputRef.current.click === 'function') fileInputRef.current.click()
      }

      const addFiles = (fileList) => {
        const incoming = Array.from(fileList || []).filter(Boolean)
        if (incoming.length === 0) return
        const kept = attachments.slice()
        let error = null
        for (const file of incoming) {
          if (kept.length >= CHAT_ATTACH_MAX_FILES) {
            error = t('chat.attach.tooMany', { max: CHAT_ATTACH_MAX_FILES })
            break
          }
          if (Number(file.size) > CHAT_ATTACH_MAX_BYTES) {
            error = t('chat.attach.tooLarge', { name: file.name || '', size: formatBytes(CHAT_ATTACH_MAX_BYTES) })
            continue
          }
          const total = kept.reduce((sum, item) => sum + (Number(item.size) || 0), 0) + (Number(file.size) || 0)
          if (total > CHAT_ATTACH_TOTAL_BYTES) {
            error = t('chat.attach.tooBig', { size: formatBytes(CHAT_ATTACH_TOTAL_BYTES) })
            continue
          }
          kept.push({
            key: 'pick-' + (kept.length + 1) + '-' + String(file.name || '') + '-' + String(file.size || 0),
            name: file.name || 'file',
            size: Number(file.size) || 0,
            type: file.type || '',
            file,
          })
        }
        setAttachments(kept)
        setAttachError(error)
      }

      const removeAttachment = (key) => {
        setAttachments((previous) => previous.filter((item) => item.key !== key))
        setAttachError(null)
      }

      const onFilesChange = (event) => {
        const input = event && event.target ? event.target : null
        addFiles(input && input.files ? input.files : [])
        if (input) input.value = ''
      }

      const submit = async () => {
        const text = draft
        if (readOnly) {
          if (!text.trim() || props.sending || !canWrite) return
          const relayed = await props.onRelay(text)
          if (relayed && relayed.ok) {
            setDraft('')
            setStick(true)
          }
          return
        }
        if ((!text.trim() && attachments.length === 0) || props.sending || props.uploading || !canWrite) return
        const sent = await props.onSend(text, attachments)
        if (sent && sent.ok) {
          setDraft('')
          setAttachments([])
          setAttachError(null)
          setStick(true)
        }
      }

      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return
        if (event.nativeEvent && event.nativeEvent.isComposing) return
        event.preventDefault()
        void submit()
      }

      const composeHint = !online
        ? t('chat.input.offline')
        : !desktopAvailable
          ? t('chat.error.noDesktop')
          : readOnly
            ? t('chat.input.relayHint')
            : t('chat.input.enterHint')

      const attention = (tickets || []).filter((item) => item && item.attention === true)
      const githubTickets = (tickets || []).filter((item) => item && item.source === 'github').slice(0, CHAT_SIDE_LIMIT)
      const recentDecisions = (decisions || []).slice(0, CHAT_SIDE_LIMIT)
      const threadRows = rowsOf(desktopThreads, 'desktop')
      const feishuRows = rowsOf(feishuThreads, 'feishu')
      const githubRows = rowsOf(githubThreads, 'github')
      const totalThreads = threadRows.length + feishuRows.length + githubRows.length

      return h(
        'div',
        { className: 'sam-chat' },
        h(ChatStatusBar, {
          online,
          updatedAt: props.updatedAt,
          load: { running, max: maxWorkers, queued },
        }),
        props.stale
          ? h('div', { className: 'sam-banner sam-tone-warn' }, t('chat.error.staleHost'))
          : props.overviewError
            ? h(
                'div',
                { className: 'sam-banner sam-tone-error sam-chat-banner' },
                h('span', null, t('chat.error.overview', { message: props.overviewError })),
                h(
                  'button',
                  { type: 'button', className: 'sam-button sam-chat-dismiss', onClick: props.onDismissOverviewError },
                  t('chat.dismiss'),
                ),
              )
            : null,
        errors.length > 0
          ? h(
              'div',
              { className: 'sam-banner sam-tone-warn' },
              t('chat.error.partial', { list: errors.slice(0, 3).join(' · ') }),
            )
          : null,
        h(
          'div',
          { className: 'sam-chat-grid' },
          h(
            'section',
            { className: 'sam-chat-col sam-chat-list', 'aria-label': t('chat.list.title') },
            h(
              'div',
              { className: 'sam-chat-col-head' },
              h('span', null, t('chat.list.title')),
              h('span', { className: 'sam-muted' }, String(totalThreads)),
            ),
            h(
              'div',
              { className: 'sam-chat-list-body' },
              h(ChatGroup, {
                label: t('chat.list.desktop'),
                empty: desktopEmpty,
                rows: threadRows,
                action: desktopAvailable
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'sam-button sam-chat-new',
                        onClick: () => void props.onCreateThread(),
                        disabled: Boolean(props.creating) || !online,
                        title: t('chat.newThread'),
                      },
                      t('chat.newThread'),
                    )
                  : null,
              }),
              h(ChatGroup, {
                label: t('chat.list.feishu'),
                empty: feishuThreads === null ? t('chat.empty.data') : t('chat.list.emptyFeishu'),
                rows: feishuRows,
              }),
              h(ChatGroup, {
                label: t('chat.list.github'),
                empty: githubThreads === null ? t('chat.empty.data') : t('chat.list.emptyGithub'),
                rows: githubRows,
              }),
            ),
          ),
          h(
            'section',
            { className: 'sam-chat-col sam-chat-main', 'aria-label': currentTitle },
            h(
              'div',
              { className: 'sam-chat-col-head' },
              h(
                'span',
                { className: 'sam-chat-item-top' },
                h('span', { className: 'sam-chat-item-title', title: currentTitle }, currentTitle),
                h('span', { className: 'sam-chat-source' }, chatSourceLabel(source)),
                readOnly ? h('span', { className: 'sam-chat-source' }, t('chat.badge.readonly')) : null,
              ),
              readOnly ? h('span', { className: 'sam-muted' }, t('chat.hint.readonly')) : null,
            ),
            h(
              'div',
              {
                className: 'sam-chat-stream',
                ref: streamRef,
                role: 'log',
                'aria-live': 'polite',
                onScroll,
              },
              messages.length > 0
                ? messages.map((message, index) =>
                    h(ChatBubble, { key: message.id || 'msg-' + index, message, readOnly }),
                  )
                : emptyBody,
              showPending
                ? h(
                    'div',
                    { className: 'sam-chat-msg sam-chat-msg-agent sam-chat-pending', role: 'status', 'aria-live': 'polite' },
                    h(
                      'div',
                      { className: 'sam-chat-msg-meta' },
                      h('span', null, t('chat.role.agent')),
                    ),
                    h(
                      'div',
                      { className: 'sam-chat-bubble' },
                      h(
                        'span',
                        { className: 'sam-chat-dots', 'aria-hidden': true },
                        h('span'),
                        h('span'),
                        h('span'),
                      ),
                      h('span', { className: 'sam-chat-pending-text' }, t('chat.pending')),
                    ),
                    pendingLong
                      ? h('div', { className: 'sam-chat-pending-long' }, t('chat.pendingLong'))
                      : null,
                  )
                : null,
            ),
            !stick && messages.length > 0
              ? h(
                  'div',
                  { className: 'sam-chat-jump' },
                  h('button', { type: 'button', className: 'sam-button', onClick: jump }, t('chat.scroll.latest')),
                )
              : null,
            readOnlyDetail
              ? h(
                  'div',
                  { className: 'sam-chat-rov' },
                  h(
                    'div',
                    { className: 'sam-chat-rov-head' },
                    h('span', { className: 'sam-chat-rov-title' }, t('chat.readonly.tickets')),
                    h('span', { className: 'sam-chat-row-meta' }, String(readOnlyTickets.length)),
                  ),
                  readOnlyTickets.length > 0
                    ? readOnlyTickets.map((ticket, index) => {
                        const thread =
                          Array.isArray(ticket.threads) && ticket.threads[0] && typeof ticket.threads[0] === 'object'
                            ? ticket.threads[0]
                            : null
                        const href = safeHref(thread && thread.url)
                        const question =
                          ticket.attention && typeof ticket.attention === 'object' && ticket.attention.question
                            ? String(ticket.attention.question)
                            : ''
                        const summary = typeof ticket.summary === 'string' ? ticket.summary.slice(0, 200) : ''
                        return h(
                          'div',
                          { key: ticket.id || 'rov-ticket-' + index, className: 'sam-chat-row-item' },
                          h(
                            'span',
                            { className: 'sam-chat-rov-top' },
                            h(
                              'span',
                              { className: 'sam-chat-row-title', title: ticket.title || '' },
                              ticket.title || ticket.id || '',
                            ),
                            h('span', { className: 'sam-chat-kind' }, ticketStageLabel(ticket.stage)),
                            href
                              ? h(
                                  'a',
                                  {
                                    className: 'sam-link',
                                    href,
                                    target: '_blank',
                                    rel: 'noreferrer',
                                    title: thread.url,
                                  },
                                  chatSourceLabel(thread.source) + ' ↗',
                                )
                              : null,
                          ),
                          summary ? h('span', { className: 'sam-chat-row-meta' }, summary) : null,
                          question
                            ? h('span', { className: 'sam-chat-rov-question' }, t('chat.readonly.question', { question }))
                            : null,
                        )
                      })
                    : h('p', { className: 'sam-chat-row-meta' }, t('chat.readonly.noTickets')),
                )
              : null,
            props.actionError
              ? h(
                  'div',
                  { className: 'sam-banner sam-tone-error sam-chat-banner' },
                  h('span', null, props.actionError),
                  h(
                    'button',
                    { type: 'button', className: 'sam-button sam-chat-dismiss', onClick: props.onDismissActionError },
                    t('chat.dismiss'),
                  ),
                )
              : null,
            h(ChatComposer, {
              value: draft,
              onChange: setDraft,
              onSend: () => void submit(),
              onKeyDown,
              sending: props.sending,
              uploading: props.uploading,
              disabled: !canWrite || props.sending || props.uploading,
              canSend: readOnly ? Boolean(draft.trim()) : Boolean(draft.trim()) || attachments.length > 0,
              label: readOnly ? t('chat.input.relay') : t('chat.input.send'),
              placeholder: readOnly ? t('chat.input.placeholderRelay') : t('chat.input.placeholder'),
              hint: composeHint,
              readOnly,
              attachments,
              attachError,
              fileRef: fileInputRef,
              onPickFiles: pickFiles,
              onFilesChange,
              onRemoveAttachment: removeAttachment,
            }),
          ),
          h(
            'aside',
            { className: 'sam-chat-col sam-chat-side', 'aria-label': t('chat.side.title') },
            h('div', { className: 'sam-chat-col-head' }, h('span', null, t('chat.side.title'))),
            h(
              'div',
              { className: 'sam-chat-side-body' },
              h(
                'div',
                { className: 'sam-chat-card' },
                h('h3', { className: 'sam-chat-card-title' }, t('chat.side.status')),
                h(
                  'div',
                  { className: 'sam-chat-kv' },
                  h('span', null, t('chat.label.online')),
                  h(
                    'span',
                    { className: 'sam-tone-' + (online ? 'ok' : 'error') },
                    online ? t('chat.online') : t('chat.offline'),
                  ),
                ),
                h(
                  'div',
                  { className: 'sam-chat-kv' },
                  h('span', null, t('chat.label.service')),
                  h('span', null, t('state.' + serviceState)),
                ),
                h(
                  'div',
                  { className: 'sam-chat-kv' },
                  h('span', null, t('chat.label.executor')),
                  h('span', null, t('chat.load', { running, max: maxWorkers, queued })),
                ),
              ),
              h(
                'div',
                { className: 'sam-chat-card' },
                h('h3', { className: 'sam-chat-card-title' }, t('chat.side.attention')),
                attention.length === 0
                  ? h('p', { className: 'sam-chat-row-meta' }, t('chat.side.attentionEmpty'))
                  : attention.map((ticket, index) => {
                      const href = safeHref(ticket.url)
                      return h(
                        'div',
                        { key: ticket.id || 'attention-' + index, className: 'sam-chat-row-item' },
                        h('span', { className: 'sam-chat-row-title', title: ticket.title || '' }, ticket.title || ticket.id || ''),
                        ticket.note ? h('span', { className: 'sam-chat-row-meta' }, String(ticket.note)) : null,
                        h(
                          'span',
                          { className: 'sam-chat-row-meta' },
                          [ticketStageLabel(ticket.stage), ticket.updatedAt ? formatTime(ticket.updatedAt) : null]
                            .filter(Boolean)
                            .join(' · '),
                        ),
                        h(
                          'div',
                          { className: 'sam-chat-row-actions' },
                          href
                            ? h(
                                'a',
                                {
                                  className: 'sam-button sam-chat-mini',
                                  href,
                                  target: '_blank',
                                  rel: 'noreferrer',
                                },
                                t('chat.action.view'),
                              )
                            : null,
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'sam-button sam-chat-mini',
                              disabled: Boolean(props.sending),
                              onClick: () => void props.onStopTicket(ticket.id),
                            },
                            t('chat.action.stopTicket'),
                          ),
                        ),
                      )
                    }),
              ),
              h(
                'div',
                { className: 'sam-chat-card' },
                h('h3', { className: 'sam-chat-card-title' }, t('chat.side.decisions')),
                recentDecisions.length === 0
                  ? h(
                      'p',
                      { className: 'sam-chat-row-meta' },
                      decisions === null ? t('chat.empty.data') : t('chat.side.decisionsEmpty'),
                    )
                  : recentDecisions.map((item, index) =>
                      h(
                        'div',
                        { key: item.id || 'decision-' + index, className: 'sam-chat-row-item' },
                        h(
                          'span',
                          { className: 'sam-chat-row-title' },
                          chatOutcomeLabel(item.outcome) + (item.kind ? ' · ' + String(item.kind) : ''),
                        ),
                        item.preview || item.reason
                          ? h('span', { className: 'sam-chat-row-meta' }, String(item.preview || item.reason))
                          : null,
                        item.at ? h('span', { className: 'sam-chat-row-meta' }, formatTime(item.at)) : null,
                      ),
                    ),
              ),
              h(
                'div',
                { className: 'sam-chat-card' },
                h('h3', { className: 'sam-chat-card-title' }, t('chat.side.github')),
                githubTickets.length === 0
                  ? h('p', { className: 'sam-chat-row-meta' }, t('chat.side.githubEmpty'))
                  : githubTickets.map((ticket, index) => {
                      const href = safeHref(ticket.url)
                      return h(
                        'div',
                        { key: ticket.id || 'github-' + index, className: 'sam-chat-row-item' },
                        h('span', { className: 'sam-chat-row-title', title: ticket.title || '' }, ticket.title || ticket.id || ''),
                        h(
                          'span',
                          { className: 'sam-chat-row-meta' },
                          [ticketStageLabel(ticket.stage), ticket.updatedAt ? shortTime(ticket.updatedAt) : null]
                            .filter(Boolean)
                            .join(' · '),
                        ),
                        href ? h('a', { className: 'sam-link', href, target: '_blank', rel: 'noreferrer' }, t('chat.action.open')) : null,
                      )
                    }),
              ),
              h(
                'div',
                { className: 'sam-chat-card' },
                h('h3', { className: 'sam-chat-card-title' }, t('chat.side.feishu')),
                h(
                  'div',
                  { className: 'sam-chat-kv' },
                  h(
                    'span',
                    null,
                    !feishu
                      ? t('chat.empty.data')
                      : feishu.enabled
                        ? t('chat.side.feishuEnabled')
                        : feishu.installed === false
                          ? t('chat.side.feishuMissing')
                          : t('chat.side.feishuOff'),
                  ),
                  h(
                    'span',
                    null,
                    feishu && typeof feishu.threads === 'number'
                      ? t('chat.side.feishuOn', { count: feishu.threads })
                      : '',
                  ),
                ),
                feishu && !feishu.enabled
                  ? h('span', { className: 'sam-chat-row-meta' }, feishu.hint || t('chat.side.feishuOffHint'))
                  : null,
              ),
            ),
          ),
        ),
      )
    }

    function Metric(props) {
      return h(
        'div',
        { className: 'sam-metric' },
        h('div', { className: 'sam-metric-label' }, props.label),
        h('div', { className: toneClass('sam-metric-value', props.tone || 'idle') }, props.value),
        props.hint ? h('div', { className: 'sam-metric-hint' }, props.hint) : null,
      )
    }

    function Section(props) {
      return h(
        'section',
        { className: 'sam-section' },
        h(
          'div',
          { className: 'sam-section-head' },
          h('h2', { className: 'sam-section-title' }, props.title),
          props.hint ? h('span', { className: 'sam-muted' }, props.hint) : null,
        ),
        props.children,
      )
    }

    function Switch(props) {
      return h(
        'label',
        { className: 'sam-switch', title: props.hint || '' },
        h('input', {
          type: 'checkbox',
          checked: Boolean(props.checked),
          disabled: Boolean(props.disabled),
          onChange: (event) => props.onChange(Boolean(event.target.checked)),
        }),
        h('span', { className: 'sam-switch-text' }, props.label),
      )
    }

    function HealthChips(props) {
      const health = props.health || []
      if (health.length === 0) return h('p', { className: 'sam-muted' }, props.empty)
      return h(
        'div',
        { className: 'sam-chips' },
        health.map((entry) =>
          h(
            'span',
            {
              key: entry.name,
              className: toneClass('sam-chip', healthTone(entry.state)),
              title: entry.detail || '',
            },
            h('span', { className: 'sam-dot' }),
            h('span', null, entry.name + ' · ' + t('health.' + entry.state)),
          ),
        ),
      )
    }

    function ProblemList(props) {
      const problems = props.problems || []
      if (problems.length === 0) return h('p', { className: 'sam-muted' }, props.empty)
      return h(
        'ul',
        { className: 'sam-list' },
        problems.map((problem, index) =>
          h(
            'li',
            { key: index, className: 'sam-list-row' },
            h('span', { className: 'sam-badge sam-tone-error' }, t('problem.' + problem.kind)),
            h(
              'span',
              { className: 'sam-list-text' },
              problem.detail ||
                problem.name ||
                (problem.source && problem.source.title) ||
                (problem.thread && problem.thread.title) ||
                '',
            ),
          ),
        ),
      )
    }

    function TicketList(props) {
      const tickets = props.tickets || []
      if (tickets.length === 0) return h('p', { className: 'sam-muted' }, props.empty)
      return h(
        'ul',
        { className: 'sam-list' },
        tickets.map((ticket) =>
          h(
            'li',
            { key: ticket.id, className: 'sam-list-row' },
            h('span', { className: 'sam-ticket-title' }, ticket.title || ticket.id),
            h('span', { className: 'sam-ticket-meta' }, t('ticket.' + (ticket.stage || 'working'))),
            h('span', { className: 'sam-ticket-meta' }, formatTime(ticket.updatedAt || ticket.createdAt)),
          ),
        ),
      )
    }

    function FlowGrid(props) {
      const flow = props.flow
      if (!flow) return h('p', { className: 'sam-muted' }, props.empty)
      const keys = ['received', 'filtered', 'triggers', 'judged', 'accepted', 'evaluating', 'dropped']
      return h(
        'div',
        { className: 'sam-flow' },
        keys.map((key) =>
          h(
            'div',
            { key, className: 'sam-flow-item' },
            h('div', { className: 'sam-flow-value' }, String(flow[key] ?? 0)),
            h('div', { className: 'sam-flow-label' }, t('flow.' + key)),
          ),
        ),
      )
    }

    function LogBlock(props) {
      const tail = props.tail
      if (!tail) return null
      return h(
        'details',
        { className: 'sam-details', open: props.open || undefined },
        h(
          'summary',
          { className: 'sam-summary' },
          props.title,
          h('span', { className: 'sam-muted' }, ' · ' + baseName(tail.path)),
        ),
        tail.error ? h('p', { className: 'sam-muted' }, tail.error) : null,
        tail.lines && tail.lines.length > 0
          ? h('pre', { className: 'sam-pre' }, tail.lines.join('\n'))
          : h('p', { className: 'sam-muted' }, t('empty.log')),
      )
    }

    function OperationStrip(props) {
      const op = props.operation
      if (!op) return null
      const status = op.status === 'running' || op.status === 'error' ? op.status : 'ok'
      const log = Array.isArray(op.log) ? op.log.slice(-20) : []
      const names = Array.isArray(op.names) ? op.names : []
      return h(
        'div',
        { className: 'sam-op' },
        h(
          'div',
          { className: 'sam-op-head' },
          h(
            'span',
            { className: 'sam-op-status sam-tone-' + opTone(status) },
            h('span', { className: 'sam-dot' }),
            t('op.status.' + status),
          ),
          h('span', { className: 'sam-op-action' }, opActionLabel(op.action || op.kind)),
          h('span', { className: 'sam-op-message' }, op.message || ''),
          names.length > 0 ? h('span', { className: 'sam-op-meta' }, t('op.names', { count: names.length })) : null,
          status !== 'running' && op.exitCode !== null && op.exitCode !== undefined
            ? h('span', { className: 'sam-op-meta' }, t('op.exit', { code: op.exitCode }))
            : null,
        ),
        log.length > 0
          ? h(
              'details',
              {
                className: 'sam-details sam-op-log',
                open: status === 'running' || status === 'error' || undefined,
              },
              h('summary', { className: 'sam-summary' }, t('op.log')),
              h('pre', { className: 'sam-pre' }, log.join('\n')),
            )
          : status === 'running'
            ? h('p', { className: 'sam-muted' }, t('op.emptyLog'))
            : null,
      )
    }

    function versionLabel(item, target) {
      const source = item.version || null
      const installed = target.version || null
      if (target.specMatch === false) {
        if (source && installed) return 'v' + source + ' ≠ v' + installed
        if (source) return 'v' + source + ' ≠ —'
        if (installed) return '— ≠ v' + installed
        return '≠'
      }
      const single = source || installed
      return single ? 'v' + single : '—'
    }

    function PluginRow(props) {
      const item = props.item || {}
      const target = item.target || {}
      const state = PLUGIN_STATES.indexOf(target.state) >= 0 ? target.state : 'not-synced'
      const mismatch = target.specMatch === false
      const mismatchHint = mismatch ? t('plugin.specMismatch') : ''
      const chipTitle = [target.error, mismatchHint].filter(Boolean).join(' · ')
      const name = item.name || ''
      const ignored = item.ignored === true
      return h(
        'div',
        { className: 'sam-plugin-row' + (ignored ? ' sam-plugin-row-ignored' : '') },
        props.selectable === false
          ? h('span', { className: 'sam-plugin-check-spacer', 'aria-hidden': true })
          : h('input', {
              type: 'checkbox',
              className: 'sam-plugin-check',
              checked: Boolean(props.checked),
              disabled: Boolean(props.disabled),
              onChange: (event) => props.onToggle(name, Boolean(event.target.checked)),
              'aria-label': name,
            }),
        h('span', { className: 'sam-plugin-name', title: item.spec || name }, name),
        h(
          'span',
          {
            className: 'sam-plugin-version' + (mismatch ? ' sam-plugin-version-mismatch' : ''),
            title: mismatchHint,
          },
          versionLabel(item, target),
        ),
        h(
          'span',
          { className: 'sam-plugin-flags' },
          h(
            'span',
            { className: 'sam-plugin-flag ' + (item.enabled ? 'sam-tone-ok' : 'sam-tone-idle') },
            item.enabled ? t('plugin.enabled') : t('plugin.disabled'),
          ),
        ),
        h(
          'span',
          { className: 'sam-plugin-state ' + 'sam-tone-' + pluginStateTone(state), title: chipTitle },
          h('span', { className: 'sam-dot' }),
          pluginStateLabel(state),
        ),
        h(
          'span',
          { className: 'sam-plugin-synced' },
          target.syncedAt ? t('plugin.syncedAt', { time: formatTime(target.syncedAt) }) : t('plugin.never'),
        ),
        target.error ? h('span', { className: 'sam-plugin-error', title: target.error }, target.error) : null,
        h(
          'button',
          {
            type: 'button',
            className: 'sam-button sam-plugin-ignore',
            title: ignored ? t('plugin.unignore') : t('plugin.ignoredHint'),
            disabled: Boolean(props.ignoreDisabled) || Boolean(props.ignoreBusy),
            onClick: () => props.onIgnore(name, !ignored),
          },
          ignored ? t('plugin.unignore') : t('plugin.ignore'),
        ),
      )
    }

    function PluginSyncSection(props) {
      const plugins = props.plugins || {}
      const items = Array.isArray(plugins.items) ? plugins.items : []
      const summary = plugins.summary || {}
      const total = Number.isFinite(Number(summary.total)) ? Number(summary.total) : items.length
      const active = Number(summary.active) || 0
      const pending = Number(summary.pendingRestart) || 0
      const failed = Number(summary.failed) || 0
      const ignoredItems = items.filter((item) => item && item.ignored === true)
      const visibleItems = items.filter((item) => !(item && item.ignored === true))
      const ignoredCount = Number.isFinite(Number(summary.ignored)) ? Number(summary.ignored) : ignoredItems.length
      const unsynced = visibleItems.filter((item) => {
        const state = item && item.target ? item.target.state : null
        return state !== 'active'
      })
      const busy = Boolean(props.busy)
      const sameProfile = Boolean(plugins.sameProfile) || Boolean(props.sameProfile)
      const summaryLine =
        t('plugin.summary', { total, active, pending, failed }) +
        (ignoredCount > 0 ? ' · ' + t('plugin.ignoredCount', { count: ignoredCount }) : '')
      const lastSync = plugins.lastSyncAt
        ? ' · ' + t('plugin.lastSync', { time: formatTime(plugins.lastSyncAt) })
        : ''

      return h(
        'section',
        { className: 'sam-section sam-plugin-section' },
        h(
          'div',
          { className: 'sam-section-head' },
          h('h2', { className: 'sam-section-title' }, t('label.plugins')),
          h(
            'div',
            { className: 'sam-plugin-toggles' },
            h(Switch, {
              checked: Boolean(props.autoSync),
              disabled: busy || Boolean(props.sameProfile),
              label: t('plugin.autoSync'),
              hint: t('plugin.autoSyncHint'),
              onChange: (next) => props.onAutoSync(next),
            }),
            h(Switch, {
              checked: Boolean(props.restartAfterSync),
              disabled: busy || Boolean(props.sameProfile),
              label: t('plugin.restartAfterSync'),
              hint: t('plugin.restartAfterHint'),
              onChange: (next) => props.onRestartAfterSync(next),
            }),
          ),
        ),
        plugins.sameProfile
          ? h('div', { className: 'sam-banner sam-tone-warn' }, t('plugin.sameProfile'))
          : null,
        plugins.available === false
          ? h(
              'div',
              { className: 'sam-banner sam-tone-warn' },
              t('plugin.unavailable', { message: plugins.error || '—' }),
            )
          : null,
        plugins.lastError ? h('div', { className: 'sam-banner sam-tone-warn' }, plugins.lastError) : null,
        pending > 0
          ? h(
              'div',
              { className: 'sam-banner sam-plugin-pending' },
              h('span', null, t('plugin.pendingBanner', { count: pending })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button',
                  onClick: () => props.onRestartService(),
                  disabled: busy || !props.restartable,
                },
                t('action.restartApply'),
              ),
            )
          : null,
        plugins.available === false
          ? null
          : h(
              'div',
              { className: 'sam-plugin-toolbar' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button',
                  onClick: () => props.onSelectUnsynced(),
                  disabled: busy || sameProfile || unsynced.length === 0,
                },
                t('action.selectUnsynced'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button',
                  onClick: () => props.onClear(),
                  disabled: busy || props.selected.length === 0,
                },
                t('action.clearSelection'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button',
                  onClick: () => props.onSync(),
                  disabled: busy || sameProfile || props.selected.length === 0 || plugins.available === false,
                },
                t('action.syncSelected', { count: props.selected.length }),
              ),
              h('span', { className: 'sam-plugin-summary' }, summaryLine + lastSync),
            ),
        plugins.available === false
          ? null
          : visibleItems.length === 0
            ? h('p', { className: 'sam-muted' }, ignoredItems.length > 0 ? t('plugin.allIgnored') : t('plugin.empty'))
            : h(
                'div',
                { className: 'sam-plugin-list' },
                visibleItems.map((item, index) =>
                  h(PluginRow, {
                    key: (item && item.name) || 'plugin-' + index,
                    item,
                    checked: props.selected.indexOf(item && item.name) >= 0,
                    disabled: false,
                    ignoreBusy: props.ignoreBusy === (item && item.name),
                    ignoreDisabled: props.ignoreDisabled,
                    onToggle: props.onToggleSelect,
                    onIgnore: props.onIgnore,
                  }),
                ),
              ),
        plugins.available === false || ignoredItems.length === 0
          ? null
          : h(
              'details',
              {
                className: 'sam-details sam-ignored-group',
                'aria-label': t('label.ignoredPlugins', { count: ignoredItems.length }),
              },
              h(
                'summary',
                { className: 'sam-summary' },
                t('label.ignoredPlugins', { count: ignoredItems.length }),
                h('span', { className: 'sam-muted' }, ' · ' + t('plugin.ignoredHint')),
              ),
              h(
                'div',
                { className: 'sam-plugin-list sam-plugin-list-ignored' },
                ignoredItems.map((item, index) =>
                  h(PluginRow, {
                    key: (item && item.name) || 'ignored-' + index,
                    item,
                    selectable: false,
                    checked: false,
                    disabled: false,
                    ignoreBusy: props.ignoreBusy === (item && item.name),
                    ignoreDisabled: props.ignoreDisabled,
                    onIgnore: props.onIgnore,
                  }),
                ),
              ),
            ),
      )
    }

    function SuperagentPanel() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [updatedAt, setUpdatedAt] = React.useState(0)
      const [actionError, setActionError] = React.useState(null)
      const [actionPending, setActionPending] = React.useState(null)
      const [syncBusy, setSyncBusy] = React.useState(false)
      const [flagBusy, setFlagBusy] = React.useState(false)
      const [flagOverride, setFlagOverride] = React.useState(null)
      const [selected, setSelected] = React.useState([])
      const abortRef = React.useRef(null)
      const prevOpRef = React.useRef(null)

      /* The chat tab is the default page and its own polling feed (§4.2). */
      const [tab, setTab] = React.useState('chat')
      const chat = useChatFeed(tab === 'chat')

      const load = React.useCallback(async (fresh) => {
        if (abortRef.current) abortRef.current.abort()
        const controller = new AbortController()
        abortRef.current = controller
        if (fresh) setBusy(true)
        try {
          const response = await fetch(ROUTE + '/snapshot' + (fresh ? '?fresh=1' : ''), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('HTTP ' + response.status)
          const value = await response.json()
          setData(value)
          setError(null)
          setUpdatedAt(Date.now())
        } catch (failure) {
          if (failure && failure.name !== 'AbortError') {
            setError(messageOf(failure))
          }
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null
            setBusy(false)
          }
        }
      }, [])

      const operation = data && data.operation ? data.operation : null
      const opRunning = Boolean(operation && operation.status === 'running')
      const pending = actionPending !== null || syncBusy || flagBusy

      /* Poll fast while an operation runs, slowly when idle. */
      React.useEffect(() => {
        let active = true
        let timer
        const interval = opRunning ? FAST_REFRESH_MS : REFRESH_MS
        const schedule = (wait) => {
          timer = setTimeout(async () => {
            if (!active) return
            if (typeof document === 'undefined' || !document.hidden) await load(false)
            if (active) schedule(interval)
          }, wait)
        }
        const onVisible = () => {
          if (typeof document !== 'undefined' && !document.hidden && active) void load(false)
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
        schedule(0)
        return () => {
          active = false
          clearTimeout(timer)
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
          if (abortRef.current) abortRef.current.abort()
        }
      }, [load, opRunning])

      /* When an operation settles, pull one uncached snapshot. */
      React.useEffect(() => {
        const status = operation ? operation.status : null
        const previous = prevOpRef.current
        prevOpRef.current = status
        if (previous === 'running' && status !== 'running') void load(true)
      }, [operation, load])

      const plugins = data && data.plugins ? data.plugins : null
      const hostStale = Boolean(data) && (!plugins || !Object.prototype.hasOwnProperty.call(data, 'operation'))
      const service = data ? data.service : null
      const agent = data ? data.superagent : null
      const state = statusOf(data)
      const load_ = agent ? agent.load : null
      const overview = agent ? agent.overview : null
      const person = overview && overview.person ? overview.person : []
      const openCount = agent && agent.ticketsTotal !== null ? agent.ticketsTotal : null
      const config = (data && data.config) || {}
      const serviceRunning = Boolean(service && service.running) || Boolean(agent && agent.reachable)
      const controllable = !data
        ? false
        : typeof service.controllable === 'boolean'
          ? service.controllable
          : typeof config.controllable === 'boolean'
            ? config.controllable
            : true
      const controlsDisabled = !data || opRunning || pending || !controllable
      const startDisabled = controlsDisabled || serviceRunning
      const stopDisabled = controlsDisabled || !serviceRunning
      const restartDisabled = controlsDisabled || !serviceRunning
      const autoSync = flagOverride ? flagOverride.autoSync : Boolean(plugins && plugins.autoSync)
      const restartAfterSync = flagOverride ? flagOverride.restartAfterSync : Boolean(plugins && plugins.restartAfterSync)

      /* Drop selections that no longer exist in the snapshot. */
      React.useEffect(() => {
        const items = plugins && Array.isArray(plugins.items) ? plugins.items : null
        if (!items) return
        const names = new Set(items.map((item) => (item && item.name ? item.name : '')).filter(Boolean))
        setSelected((previous) => {
          const next = previous.filter((name) => names.has(name))
          return next.length === previous.length ? previous : next
        })
      }, [plugins])

      /* Clear an optimistic flag override once the snapshot agrees with it. */
      React.useEffect(() => {
        if (!flagOverride || !plugins) return
        if (Boolean(plugins.autoSync) === flagOverride.autoSync && Boolean(plugins.restartAfterSync) === flagOverride.restartAfterSync) {
          setFlagOverride(null)
        }
      }, [flagOverride, plugins])

      const runServiceAction = React.useCallback(
        async (action) => {
          if (!data) return
          if (action === 'stop' || action === 'restart') {
            const question = t(action === 'stop' ? 'confirm.stop' : 'confirm.restart')
            const agreed =
              typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(question) : true
            if (!agreed) return
          }
          setActionError(null)
          setActionPending(action)
          try {
            const result = await postJson('/service/' + action, {})
            if (!result.ok) {
              setActionError(errorFromResult(result))
            } else {
              await load(false)
            }
          } catch (failure) {
            setActionError(messageOf(failure))
          } finally {
            setActionPending(null)
          }
        },
        [data, load],
      )

      const syncPlugins = React.useCallback(
        async (names) => {
          if (!names || names.length === 0) return
          setActionError(null)
          setSyncBusy(true)
          try {
            const result = await postJson('/plugins/sync', { names })
            if (!result.ok) {
              setActionError(errorFromResult(result))
            } else {
              setSelected([])
              await load(false)
            }
          } catch (failure) {
            setActionError(messageOf(failure))
          } finally {
            setSyncBusy(false)
          }
        },
        [load],
      )

      const applyFlags = React.useCallback(
        async (nextAutoSync, nextRestartAfterSync) => {
          setActionError(null)
          setFlagBusy(true)
          try {
            const result = await postJson('/plugins/auto-sync', {
              enabled: Boolean(nextAutoSync),
              restartAfterSync: Boolean(nextRestartAfterSync),
            })
            if (!result.ok) {
              setActionError(errorFromResult(result))
            } else {
              const payload = result.payload || {}
              setFlagOverride({
                autoSync: typeof payload.autoSync === 'boolean' ? payload.autoSync : Boolean(nextAutoSync),
                restartAfterSync:
                  typeof payload.restartAfterSync === 'boolean'
                    ? payload.restartAfterSync
                    : Boolean(nextRestartAfterSync),
              })
              await load(true)
            }
          } catch (failure) {
            setActionError(messageOf(failure))
          } finally {
            setFlagBusy(false)
          }
        },
        [load],
      )

      const toggleSelect = React.useCallback((name, checked) => {
        if (!name) return
        setSelected((previous) => {
          if (checked) return previous.indexOf(name) >= 0 ? previous : previous.concat([name])
          return previous.filter((entry) => entry !== name)
        })
      }, [])

      const [panelLanguage, setPanelLanguage] = React.useState(currentLanguage)
      React.useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined
        return localeService.subscribe(() => setPanelLanguage(currentLanguage()))
      }, [])
      const toggleLanguage = React.useCallback(() => {
        const next = currentLanguage() === 'zh' ? 'en' : 'zh'
        setForcedLanguage(next)
        setPanelLanguage(next)
      }, [])
      const [ignoreBusy, setIgnoreBusy] = React.useState(null)

      const setIgnored = React.useCallback(
        async (name, ignored) => {
          if (!name) return
          setActionError(null)
          setIgnoreBusy(name)
          try {
            const result = await postJson('/plugins/ignore', { names: [name], ignored: Boolean(ignored) })
            if (!result.ok) {
              setActionError(errorFromResult(result))
            } else {
              if (ignored) setSelected((previous) => previous.filter((entry) => entry !== name))
              await load(false)
            }
          } catch (failure) {
            setActionError(messageOf(failure))
          } finally {
            setIgnoreBusy(null)
          }
        },
        [load],
      )

      const items = plugins && Array.isArray(plugins.items) ? plugins.items : []
      const unsyncedNames = items
        .filter((item) => (item && item.target ? item.target.state !== 'active' : false))
        .map((item) => (item && item.name ? item.name : ''))
        .filter(Boolean)
      const pluginAttention = plugins && plugins.summary
        ? (Number(plugins.summary.pendingRestart) || 0) + (Number(plugins.summary.failed) || 0)
        : 0
      const chatOverview = chat.overview
      const chatAttention =
        chatOverview && Array.isArray(chatOverview.tickets)
          ? chatOverview.tickets.filter((ticket) => ticket && ticket.attention === true).length
          : 0
      const chatErrors = chatOverview && Array.isArray(chatOverview.errors) ? chatOverview.errors.length : 0
      const chatBadge = chatAttention + chatErrors

      return h(
        'div',
        { className: 'sam-panel' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'sam-body' },
          h(
            'header',
            { className: 'sam-head' },
            h(
              'div',
              { className: 'sam-head-main' },
              h('h1', { className: 'sam-title' }, t('panel.title')),
              h(
                'span',
                { className: toneClass('sam-pill', stateTone[state] || 'idle') },
                h('span', { className: 'sam-dot' }),
                t('state.' + state),
              ),
            ),
            h(
              'div',
              { className: 'sam-actions' },
              h(
                'span',
                { className: 'sam-muted' },
                busy || chat.busy
                  ? t('label.refreshing')
                  : updatedAt
                    ? t('label.updatedAt', { time: new Date(updatedAt).toLocaleTimeString() })
                    : t('label.never'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button sam-lang',
                  onClick: toggleLanguage,
                  title: panelLanguage === 'zh' ? t('lang.switchTo.en') : t('lang.switchTo.zh'),
                  'aria-label': panelLanguage === 'zh' ? t('lang.switchTo.en') : t('lang.switchTo.zh'),
                },
                panelLanguage === 'zh' ? 'EN' : '中',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sam-button',
                  onClick: () => {
                    void load(true)
                    void chat.refresh()
                  },
                  disabled: busy || chat.busy,
                },
                t('action.refresh'),
              ),
              agent
                ? h('a', { className: 'sam-link', href: agent.url, target: '_blank', rel: 'noreferrer' }, t('action.openPanel'))
                : null,
            ),
          ),
          h('p', { className: 'sam-subtitle' }, t('panel.subtitle')),
          error ? h('div', { className: 'sam-banner sam-tone-error' }, t('error.route', { message: error })) : null,
          hostStale ? h('div', { className: 'sam-banner sam-tone-warn' }, t('error.hostStale')) : null,
          actionError ? h('div', { className: 'sam-banner sam-tone-error' }, t('error.action', { message: actionError })) : null,
          h(OperationStrip, { operation }),
          !data
            ? h('p', { className: 'sam-muted' }, t('empty.loading'))
            : h(
                'div',
                { className: 'sam-tabs-wrap' },
                h(
                  'div',
                  { className: 'sam-tabs', role: 'tablist', 'aria-label': t('tab.list') },
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'tab',
                      id: 'sam-tab-chat',
                      'aria-controls': 'sam-tabpanel-chat',
                      'aria-selected': tab === 'chat',
                      className: 'sam-tab' + (tab === 'chat' ? ' sam-tab-active' : ''),
                      onClick: () => setTab('chat'),
                    },
                    t('tab.chat'),
                    chatBadge > 0
                      ? h('span', { className: 'sam-tab-badge', title: t('chat.attentionHint') }, String(chatBadge))
                      : null,
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'tab',
                      id: 'sam-tab-settings',
                      'aria-controls': 'sam-tabpanel-settings',
                      'aria-selected': tab === 'settings',
                      className: 'sam-tab' + (tab === 'settings' ? ' sam-tab-active' : ''),
                      onClick: () => setTab('settings'),
                    },
                    t('tab.settings'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'tab',
                      id: 'sam-tab-plugins',
                      'aria-controls': 'sam-tabpanel-plugins',
                      'aria-selected': tab === 'plugins',
                      className: 'sam-tab' + (tab === 'plugins' ? ' sam-tab-active' : ''),
                      onClick: () => setTab('plugins'),
                    },
                    t('tab.plugins'),
                    pluginAttention > 0
                      ? h('span', { className: 'sam-tab-badge', title: t('plugin.attentionHint') }, String(pluginAttention))
                      : null,
                  ),
                ),
                h(
                  'div',
                  { className: 'sam-tabpanels' },
                  h(
                    'div',
                    {
                      className: 'sam-tabpanel',
                      role: 'tabpanel',
                      id: 'sam-tabpanel-chat',
                      'aria-labelledby': 'sam-tab-chat',
                      hidden: tab !== 'chat',
                    },
                    h(
                      'div',
                      { className: 'sam-content' },
                      h(ChatTab, {
                        overview: chat.overview,
                        overviewError: chat.overviewError,
                        stale: chat.stale,
                        updatedAt: chat.loadedAt,
                        selected: chat.selected,
                        messages: chat.messages,
                        threadDetail: chat.threadDetail,
                        threadDetailError: chat.threadDetailError,
                        sending: chat.sending,
                        uploading: chat.uploading,
                        creating: chat.creating,
                        filteredId: chat.filteredId,
                        onCreateThread: chat.createThread,
                        actionError: chat.actionError,
                        onSelect: chat.select,
                        onSend: chat.send,
                        onRelay: chat.relay,
                        onStopTicket: chat.stopTicket,
                        onDismissOverviewError: chat.clearOverviewError,
                        onDismissActionError: chat.clearActionError,
                      }),
                    ),
                  ),
                  h(
                    'div',
                    {
                      className: 'sam-tabpanel',
                      role: 'tabpanel',
                      id: 'sam-tabpanel-settings',
                      'aria-labelledby': 'sam-tab-settings',
                      hidden: tab !== 'settings',
                    },
                    h(
                      'div',
                      { className: 'sam-content' },
                      h(
                        Section,
                        { title: t('label.serviceControl'), hint: t('hint.serviceControl') },
                        h(
                          'div',
                          { className: 'sam-op-actions' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'sam-button',
                              onClick: () => void runServiceAction('start'),
                              disabled: startDisabled,
                              title: controllable ? '' : t('hint.uncontrollable'),
                            },
                            t('action.start'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'sam-button',
                              onClick: () => void runServiceAction('stop'),
                              disabled: stopDisabled,
                              title: controllable ? '' : t('hint.uncontrollable'),
                            },
                            t('action.stop'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'sam-button',
                              onClick: () => void runServiceAction('restart'),
                              disabled: restartDisabled,
                              title: controllable ? '' : t('hint.uncontrollable'),
                            },
                            t('action.restart'),
                          ),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'sam-metrics' },
                        h(Metric, {
                          label: t('card.service'),
                          value: service && service.loaded
                            ? service.running
                              ? t('state.running')
                              : t('service.waiting')
                            : t('service.notLoaded'),
                          hint: service && service.loaded
                            ? t('hint.service', {
                                runs: service.runs ?? '—',
                                exit: service.lastExitCode ?? '—',
                                interval: service.intervalSeconds ? service.intervalSeconds + 's' : '—',
                              })
                            : t('hint.serviceOff'),
                          tone: service && service.loaded ? (service.lastExitCode ? 'warn' : 'ok') : 'warn',
                        }),
                        h(Metric, {
                          label: t('card.agent'),
                          value: t('state.' + state),
                          hint: agent
                            ? t('hint.agent', {
                                pid: agent.pid !== null && agent.pid !== undefined ? agent.pid : agent.reachable ? '—' : t('label.never'),
                                url: agent.url,
                              })
                            : '—',
                          tone: stateTone[state] || 'idle',
                        }),
                        h(Metric, {
                          label: t('card.executor'),
                          value: load_ ? (load_.running ?? 0) + ' / ' + (load_.maxWorkers ?? '—') : '—',
                          hint: load_
                            ? t('hint.executor', { queued: load_.queued ?? 0, max: load_.maxWorkers ?? '—' })
                            : t('label.never'),
                          tone: agent && agent.paused ? 'warn' : 'ok',
                        }),
                        h(Metric, {
                          label: t('card.tickets'),
                          value: String(person.length),
                          hint: t('hint.tickets', { total: openCount === null ? '—' : openCount }),
                          tone: person.length > 0 ? 'warn' : 'ok',
                        }),
                      ),
                      h(
                        Section,
                        { title: t('label.health') },
                        h(HealthChips, { health: agent ? agent.health : [], empty: t('empty.health') }),
                      ),
                      h(
                        Section,
                        { title: t('label.problems') },
                        h(ProblemList, { problems: overview ? overview.problems : [], empty: t('empty.problems') }),
                      ),
                      h(Section, { title: t('label.flow') }, h(FlowGrid, { flow: overview ? overview.flow : null, empty: t('empty.flow') })),
                      h(
                        Section,
                        { title: t('label.tickets') },
                        h(TicketList, { tickets: person, empty: t('empty.tickets') }),
                      ),
                      h(
                        Section,
                        { title: t('label.recent') },
                        agent && agent.ticketsError
                          ? h('p', { className: 'sam-muted' }, t('error.tickets'))
                          : h(TicketList, { tickets: agent ? agent.tickets : [], empty: t('empty.recent') }),
                      ),
                      agent && !agent.reachable && !agent.manuallyStopped
                        ? h('div', { className: 'sam-banner sam-tone-warn' }, t('error.agent'))
                        : null,
                      h(
                        Section,
                        { title: t('label.logs') },
                        agent && agent.log
                          ? h(LogBlock, { tail: agent.log, title: t('label.log.agent'), open: true })
                          : null,
                        service && service.stderrTail && service.stderrTail.lines.length > 0
                          ? h(LogBlock, { tail: service.stderrTail, title: t('label.log.stderr'), open: service.lastExitCode !== 0 })
                          : null,
                        service && service.stdoutTail && service.stdoutTail.lines.length > 0
                          ? h(LogBlock, { tail: service.stdoutTail, title: t('label.log.stdout'), open: false })
                          : null,
                      ),
                      h(
                        'footer',
                        { className: 'sam-footer' },
                        h('div', { className: 'sam-footer-title' }, t('label.config')),
                        h(
                          'div',
                          { className: 'sam-footer-rows' },
                          h('span', null, 'root: ' + (config.root || '—')),
                          h('span', null, 'state: ' + (config.stateDir || '—')),
                          h('span', null, 'profile: ' + (config.profile || '—')),
                          h('span', null, 'launchd: ' + (service && service.label ? service.label : '—')),
                          h('span', null, 'url: ' + (config.url || '—')),
                          config.hostVersion ? h('span', null, 'host: v' + config.hostVersion) : null,
                          plugins && plugins.source ? h('span', null, 'source: ' + (plugins.source.dir || '—')) : null,
                          plugins && plugins.target ? h('span', null, 'target: ' + (plugins.target.dir || '—')) : null,
                        ),
                      ),
                    ),
                  ),
                  h(
                    'div',
                    {
                      className: 'sam-tabpanel',
                      role: 'tabpanel',
                      id: 'sam-tabpanel-plugins',
                      'aria-labelledby': 'sam-tab-plugins',
                      hidden: tab !== 'plugins',
                    },
                    h(
                      'div',
                      { className: 'sam-content' },
                      plugins
                        ? h(PluginSyncSection, {
                            plugins,
                            autoSync,
                            restartAfterSync,
                            sameProfile: Boolean(plugins.sameProfile),
                            selected,
                            busy: pending || opRunning,
                            restartable: controllable,
                            onToggleSelect: toggleSelect,
                            onSelectUnsynced: () => setSelected(unsyncedNames),
                            onClear: () => setSelected([]),
                            onSync: () => void syncPlugins(selected),
                            onAutoSync: (next) => void applyFlags(next, restartAfterSync),
                            onRestartAfterSync: (next) => void applyFlags(autoSync, next),
                            onRestartService: () => void runServiceAction('restart'),
                            onIgnore: (name, ignored) => void setIgnored(name, ignored),
                            ignoreBusy,
                            ignoreDisabled: pending || opRunning || Boolean(ignoreBusy),
                          })
                        : h('p', { className: 'sam-muted' }, t('plugin.noHost')),
                    ),
                  ),
                ),
              ),
        ),
      )
    }

    function SidebarEntryIcon(props) {
      const size = (props && props.size) || 16
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('rect', { x: 3.2, y: 3.2, width: 17.6, height: 17.6, rx: 5, opacity: 0.55 }),
        h('path', { d: 'M6.6 12.2h3l1.7-4.4 2.4 8.4 1.4-4h2.3' }),
      )
    }

    const CSS = `
.sam-panel{box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.sam-body{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;max-width:1120px;margin:0 auto;padding:calc(20px + var(--dsh-frame-top-clearance,0px)) clamp(16px,4vw,40px) 32px}
.sam-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sam-head-main{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
.sam-title{margin:0;font-size:19px;font-weight:600;letter-spacing:-0.01em}
.sam-subtitle{margin:-6px 0 0;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.sam-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:12px}
.sam-button{box-sizing:border-box;height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.sam-button:hover{background:var(--dsw-alias-bg-layer-2)}
.sam-button:disabled{opacity:.55;cursor:default}
.sam-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px}
.sam-lang{min-width:38px;font-variant-numeric:tabular-nums;font-weight:600}
.sam-link:hover{text-decoration:underline}
.sam-pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.sam-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.sam-tone-ok{color:var(--dsw-alias-state-success-primary)}
.sam-tone-warn{color:var(--dsw-alias-state-warn-primary)}
.sam-tone-error{color:var(--dsw-alias-state-error-primary)}
.sam-tone-idle{color:var(--dsw-alias-state-idle-primary)}
.sam-content{display:flex;flex-direction:column;gap:14px;min-width:0}
.sam-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.sam-metric{box-sizing:border-box;display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);min-width:0}
.sam-metric-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.sam-metric-value{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.25}
.sam-metric-hint{color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sam-section{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.sam-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.sam-section-title{margin:0;font-size:13px;font-weight:600}
.sam-muted{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0}
.sam-chips{display:flex;flex-wrap:wrap;gap:6px}
.sam-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11.5px;color:var(--dsw-alias-label-primary)}
.sam-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.sam-list-row{display:flex;align-items:baseline;gap:10px;min-width:0;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.sam-list-row:last-child{border-bottom:0}
.sam-list-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}
.sam-badge{flex:none;font-size:11.5px;color:var(--dsw-alias-label-primary)}
.sam-ticket-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.sam-ticket-meta{flex:none;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}
.sam-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px}
.sam-flow-item{padding:8px 6px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);text-align:center}
.sam-flow-value{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.sam-flow-label{color:var(--dsw-alias-label-secondary);font-size:11px}
.sam-banner{padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary)}
.sam-banner.sam-tone-error{color:var(--dsw-alias-state-error-primary)}
.sam-details{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:8px 10px}
.sam-summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-primary)}
.sam-pre{margin:8px 0 0;max-height:240px;overflow:auto;padding:8px 10px;border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.sam-footer{display:flex;flex-direction:column;gap:4px;padding-top:4px;color:var(--dsw-alias-label-secondary);font-size:11px}
.sam-footer-title{font-weight:600;font-size:11.5px;color:var(--dsw-alias-label-primary)}
.sam-footer-rows{display:flex;flex-direction:column;gap:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.sam-op-actions{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.sam-tabs-wrap{display:flex;flex-direction:column;gap:12px;min-width:0}
.sam-tabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:2px}
.sam-tab{box-sizing:border-box;display:inline-flex;align-items:center;height:30px;padding:0 12px;border:0;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}
.sam-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.sam-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.sam-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;margin-left:6px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base);font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums}
.sam-tabpanels{min-width:0}
.sam-tabpanel{min-width:0}
.sam-tabpanel[hidden]{display:none !important}
.sam-op{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.sam-op-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;min-width:0}
.sam-op-status{display:inline-flex;align-items:center;gap:6px;flex:none;font-weight:600}
.sam-op-action{flex:none;color:var(--dsw-alias-label-primary);font-weight:600}
.sam-op-message{min-width:0;flex:1 1 220px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.sam-op-meta{flex:none;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}
.sam-op-log pre{max-height:200px}
.sam-plugin-toggles{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.sam-switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none}
.sam-switch input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.sam-switch:has(input:disabled){opacity:.55;cursor:default}
.sam-plugin-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sam-plugin-toolbar .sam-button{height:26px;padding:0 10px}
.sam-plugin-summary{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}
.sam-plugin-list{display:flex;flex-direction:column}
.sam-plugin-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}
.sam-plugin-row:last-child{border-bottom:0}
.sam-plugin-check{flex:none;width:13px;height:13px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.sam-plugin-check-spacer{flex:none;width:13px;height:13px}
.sam-plugin-row-ignored{opacity:.8}
.sam-plugin-ignore{flex:none;height:22px;padding:0 8px;border-radius:6px;font-size:11.5px}
.sam-ignored-group{margin-top:4px}
.sam-ignored-group .sam-plugin-list-ignored{padding-top:4px}
.sam-plugin-name{flex:1 1 180px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.sam-plugin-version{flex:none;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}
.sam-plugin-version-mismatch{color:var(--dsw-alias-state-warn-primary)}
.sam-plugin-flags{flex:none;display:inline-flex;gap:6px}
.sam-plugin-flag{font-size:11.5px}
.sam-plugin-state{display:inline-flex;align-items:center;gap:5px;flex:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11.5px}
.sam-plugin-synced{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}
.sam-plugin-error{flex:1 1 100%;color:var(--dsw-alias-state-error-primary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sam-plugin-pending{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-state-warn-primary)}
.sam-chat{display:flex;flex-direction:column;gap:10px;min-width:0}
.sam-chat-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.sam-chat-bar-status{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sam-chat-bar-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sam-chat-bar-spacer{flex:1 1 auto}
.sam-chat-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sam-chat-dismiss{flex:none;height:24px;padding:0 8px;border-radius:6px;font-size:11.5px}
.sam-chat-grid{display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr) minmax(200px,280px);gap:10px;align-items:stretch;min-width:0}
.sam-chat-col{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.sam-chat-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;font-weight:600;min-width:0}
.sam-chat-list-body{display:flex;flex-direction:column;gap:2px;overflow:auto;max-height:560px;padding:6px 6px 8px}
.sam-chat-group{display:flex;flex-direction:column;gap:1px;min-width:0}
.sam-chat-group-label{padding:6px 8px 4px;color:var(--dsw-alias-label-secondary);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}
.sam-chat-group-empty{margin:0;padding:2px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.sam-chat-item{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:100%;padding:7px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.sam-chat-item:hover{background:var(--dsw-alias-bg-layer-2)}
.sam-chat-item-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.sam-chat-item-top{display:flex;align-items:center;gap:6px;min-width:0}
.sam-chat-item-title{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.sam-chat-item-time{flex:none;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums}
.sam-chat-item-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.sam-chat-source{flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:400;white-space:nowrap}
.sam-chat-stream{flex:1 1 auto;display:flex;flex-direction:column;gap:8px;overflow:auto;max-height:560px;min-height:200px;padding:10px 12px}
.sam-chat-msg{display:flex;flex-direction:column;gap:3px;max-width:min(80%,640px);min-width:0}
.sam-chat-msg-person{align-self:flex-end;align-items:flex-end}
.sam-chat-msg-agent{align-self:flex-start;align-items:flex-start}
.sam-chat-msg-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.sam-chat-kind{flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px}
.sam-chat-bubble{box-sizing:border-box;padding:7px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.sam-chat-msg-person .sam-chat-bubble{border:1px solid var(--dsw-alias-brand-primary)}
.sam-chat-msg-agent .sam-chat-bubble{border:1px solid var(--dsw-alias-border-l1)}
.sam-chat-empty{display:flex;flex-direction:column;gap:6px;align-items:flex-start;justify-content:center;margin:0;padding:18px 14px;color:var(--dsw-alias-label-secondary);font-size:12px}
.sam-chat-empty strong{color:var(--dsw-alias-label-primary);font-size:12.5px}
.sam-chat-jump{display:flex;justify-content:center;padding:0 12px 6px}
.sam-chat-compose{display:flex;flex-direction:column;gap:6px;padding:8px 12px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.sam-chat-hint{color:var(--dsw-alias-label-secondary);font-size:11px}
.sam-chat-row{display:flex;align-items:flex-end;gap:8px}
.sam-chat-input{box-sizing:border-box;flex:1 1 auto;min-height:54px;max-height:160px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.5}
.sam-chat-input:disabled{opacity:.6;cursor:default}
.sam-chat-send{box-sizing:border-box;flex:none;height:34px;padding:0 14px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.sam-chat-send:disabled{opacity:.55;cursor:default}
.sam-chat-side-body{display:flex;flex-direction:column;gap:10px;overflow:auto;max-height:560px;padding:10px 12px}
.sam-chat-card{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);min-width:0}
.sam-chat-card-title{margin:0 0 2px;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sam-chat-kv{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);min-width:0}
.sam-chat-kv span:last-child{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}
.sam-chat-row-item{display:flex;flex-direction:column;gap:2px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11.5px;min-width:0}
.sam-chat-row-item:last-child{border-bottom:0}
.sam-chat-row-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:11.5px}
.sam-chat-row-meta{margin:0;color:var(--dsw-alias-label-secondary);font-size:10.5px;overflow-wrap:anywhere}
.sam-chat-row-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.sam-chat-mini{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:11.5px;text-decoration:none}
.sam-chat-group-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px 4px}
.sam-chat-group-head .sam-chat-group-label{padding:0}
.sam-chat-new{flex:none;height:20px;padding:0 7px;border-radius:6px;font-size:10.5px}
.sam-chat-dots{display:inline-flex;align-items:center;gap:3px;margin-right:6px;vertical-align:middle}
.sam-chat-dots span{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.3;animation:sam-chat-blink 1.2s infinite ease-in-out}
.sam-chat-dots span:nth-child(2){animation-delay:.18s}
.sam-chat-dots span:nth-child(3){animation-delay:.36s}
@keyframes sam-chat-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.sam-chat-pending-text{vertical-align:middle}
.sam-chat-pending-long{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.sam-chat-attachments{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.sam-chat-attach{box-sizing:border-box;display:flex;align-items:baseline;gap:8px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11.5px;text-decoration:none;min-width:0}
.sam-chat-attach:hover{border-color:var(--dsw-alias-brand-primary)}
.sam-chat-attach-name{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sam-chat-attach-meta{flex:none;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sam-chat-attach-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.sam-chat-attach-btn{flex:none;height:24px;padding:0 9px;border-radius:6px;font-size:11.5px}
.sam-chat-file{display:none}
.sam-chat-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.sam-chat-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 4px 2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-primary)}
.sam-chat-chip-name{min-width:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sam-chat-chip-size{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;font-variant-numeric:tabular-nums}
.sam-chat-chip-remove{flex:none;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:1;cursor:pointer}
.sam-chat-chip-remove:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.sam-chat-rov{display:flex;flex-direction:column;gap:2px;max-height:180px;overflow:auto;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.sam-chat-rov-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-bottom:2px}
.sam-chat-rov-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sam-chat-rov-top{display:flex;align-items:center;gap:6px;min-width:0}
.sam-chat-rov-top .sam-link{flex:none;margin-left:auto;font-size:11px}
.sam-chat-rov-question{color:var(--dsw-alias-state-warn-primary);font-size:11px;overflow-wrap:anywhere}
@media (max-width:900px){
.sam-chat-grid{grid-template-columns:minmax(0,1fr)}
.sam-chat-list-body,.sam-chat-stream,.sam-chat-side-body{max-height:none}
.sam-chat-stream{min-height:220px}
.sam-chat-msg{max-width:100%}
}
`

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
          if (locale && typeof locale.register === 'function') {
            let registered = false
            try {
              locale.register(NS, DICT)
              registered = true
            } catch {
              /* Fall back to the single-locale form, which also tolerates a repeated apply. */
              try {
                locale.register(NS, 'zh', DICT.zh)
                locale.register(NS, 'en', DICT.en)
                registered = true
              } catch {
                /* Keep the document-language fallback. */
              }
            }
            if (registered) {
              localeService = locale
              boundTranslate = locale.bind(NS)
            }
          }
        } catch {
          /* Keep the document-language fallback. */
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_KEY }, SuperagentPanel))
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_KEY,
              order: ENTRY_ORDER,
              label: () => t('nav.title'),
              locale: NS,
            },
            SidebarEntryIcon,
          ),
        )
      },
    }
  },
})
