import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type * as echarts from 'echarts';
import { GoogleAnalyticsService } from '../../core/services/google-analytics.service';
import { ThemeService } from '../../core/services/theme.service';
import { SeoService } from '../../core/services/seo.service';
import {
  GaConfigStatusDto,
  GaRealtimeReportDto,
  GoogleAnalyticsReportDto,
} from '../../core/models/google-analytics.model';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DecimalPipe],
  templateUrl: './analytics-dashboard.component.html',
  styleUrl: './analytics-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit {
  private readonly gaService = inject(GoogleAnalyticsService);
  protected readonly theme = inject(ThemeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly seo = inject(SeoService);

  @ViewChild('mainChartRef') mainChartRef?: ElementRef<HTMLDivElement>;
  @ViewChild('sourcesChartRef') sourcesChartRef?: ElementRef<HTMLDivElement>;
  @ViewChild('deviceChartRef') deviceChartRef?: ElementRef<HTMLDivElement>;

  // ECharts instances
  private echartsModule: typeof import('echarts') | null = null;
  private mainChart: echarts.ECharts | null = null;
  private sourcesChart: echarts.ECharts | null = null;
  private deviceChart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private realtimeTimer: any = null;

  // State signals
  readonly selectedDays = signal<number>(30);
  readonly selectedMetric = signal<'users_views' | 'users' | 'sessions' | 'views'>('users_views');
  readonly report = signal<GoogleAnalyticsReportDto | null>(null);
  readonly realtime = signal<GaRealtimeReportDto | null>(null);
  readonly status = signal<GaConfigStatusDto | null>(null);
  readonly loading = signal<boolean>(true);
  readonly refreshing = signal<boolean>(false);
  readonly isSetupModalOpen = signal<boolean>(false);
  readonly pageSearch = signal<string>('');
  readonly activeTab = signal<'pages' | 'geo' | 'events'>('pages');

  // Filtered pages computed signal
  readonly filteredPages = computed(() => {
    const rep = this.report();
    if (!rep?.topPages) return [];
    const query = this.pageSearch().trim().toLowerCase();
    if (!query) return rep.topPages;
    return rep.topPages.filter(
      (p) =>
        p.pagePath.toLowerCase().includes(query) ||
        p.pageTitle.toLowerCase().includes(query)
    );
  });

  constructor() {
    // Re-render charts when theme changes
    effect(() => {
      const isDark = this.theme.dark();
      if (isPlatformBrowser(this.platformId) && this.mainChart) {
        setTimeout(() => this.renderAllCharts(), 50);
      }
    });
  }

  private resizeTimeout: any = null;
  private readonly onWindowResize = () => {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      if (this.report()) {
        this.renderAllCharts();
      }
    }, 150);
  };

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Public Telemetry & Google Analytics Insights',
      description: 'Transparent real-time website analytics, visitor traffic telemetry, top referring pages, and audience demographics for RankUp.',
      url: 'https://rankup.cyou/analytics',
    });

    this.loadData();
    this.loadStatus();

    if (isPlatformBrowser(this.platformId)) {
      // Poll real-time active users every 25 seconds
      this.realtimeTimer = setInterval(() => {
        this.pollRealtime();
      }, 25000);

      this.destroyRef.onDestroy(() => {
        if (this.realtimeTimer) {
          clearInterval(this.realtimeTimer);
        }
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        if (isPlatformBrowser(this.platformId)) {
          window.removeEventListener('resize', this.onWindowResize);
          window.removeEventListener('orientationchange', this.onWindowResize);
        }
        this.destroyCharts();
      });
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initResizeObserver();
      window.addEventListener('resize', this.onWindowResize);
      window.addEventListener('orientationchange', this.onWindowResize);
    }
  }

  setDays(days: number): void {
    if (this.selectedDays() === days) return;
    this.selectedDays.set(days);
    this.loadData();
  }

  setMetric(metric: 'users_views' | 'users' | 'sessions' | 'views'): void {
    this.selectedMetric.set(metric);
    this.renderMainChart();
  }

  setActiveTab(tab: 'pages' | 'geo' | 'events'): void {
    this.activeTab.set(tab);
  }

  refresh(): void {
    this.refreshing.set(true);
    this.loadData(() => this.refreshing.set(false));
    this.pollRealtime();
  }

  openSetupModal(): void {
    this.isSetupModalOpen.set(true);
  }

  closeSetupModal(): void {
    this.isSetupModalOpen.set(false);
  }

  private loadData(onComplete?: () => void): void {
    if (!this.report()) {
      this.loading.set(true);
    }
    this.gaService.getOverview(this.selectedDays()).subscribe({
      next: (data) => {
        this.report.set(data);
        if (data.realtime) {
          this.realtime.set(data.realtime);
        }
        this.loading.set(false);
        onComplete?.();
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.renderAllCharts(), 60);
        }
      },
      error: () => {
        this.loading.set(false);
        onComplete?.();
      },
    });
  }

  private pollRealtime(): void {
    this.gaService.getRealtime().subscribe({
      next: (rt) => this.realtime.set(rt),
      error: () => {},
    });
  }

  loadStatus(): void {
    this.gaService.getStatus().subscribe({
      next: (s) => this.status.set(s),
      error: () => {},
    });
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.mainChart?.resize();
      this.sourcesChart?.resize();
      this.deviceChart?.resize();
    });

    if (this.mainChartRef?.nativeElement) {
      this.resizeObserver.observe(this.mainChartRef.nativeElement);
    }
    if (this.sourcesChartRef?.nativeElement) {
      this.resizeObserver.observe(this.sourcesChartRef.nativeElement);
    }
    if (this.deviceChartRef?.nativeElement) {
      this.resizeObserver.observe(this.deviceChartRef.nativeElement);
    }
  }

  private async ensureECharts(): Promise<typeof import('echarts') | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.echartsModule) {
      this.echartsModule = await import('echarts');
    }
    return this.echartsModule;
  }

  private async renderAllCharts(): Promise<void> {
    await this.ensureECharts();
    this.renderMainChart();
    this.renderSourcesChart();
    this.renderDeviceChart();
  }

  private renderMainChart(): void {
    const container = this.mainChartRef?.nativeElement;
    const reportData = this.report();
    if (!container || !reportData || !this.echartsModule) return;

    if (!this.mainChart) {
      this.mainChart = this.echartsModule.init(container, undefined, { renderer: 'svg' });
    }

    const isDark = this.theme.dark();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    const isMobile = isPlatformBrowser(this.platformId) && window.innerWidth < 640;
    const isVerySmall = isPlatformBrowser(this.platformId) && window.innerWidth < 420;

    const seriesData = reportData.timeSeries;
    const dates = seriesData.map((d) => d.label);
    const users = seriesData.map((d) => d.activeUsers);
    const views = seriesData.map((d) => d.pageViews);
    const sessions = seriesData.map((d) => d.sessions);

    const metric = this.selectedMetric();
    const series: any[] = [];
    const yAxis: any[] = [];

    const axisFontSize = isMobile ? 10 : 11;

    if (metric === 'users_views') {
      yAxis.push(
        {
          type: 'value',
          name: 'Users',
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: textColor, fontSize: axisFontSize },
          splitLine: { lineStyle: { color: gridLineColor } },
        },
        {
          type: 'value',
          name: 'Page Views',
          nameTextStyle: { color: '#0ea5e9', fontSize: axisFontSize },
          axisLabel: { color: '#0ea5e9', fontSize: axisFontSize },
          splitLine: { show: false },
        }
      );

      series.push(
        {
          name: 'Active Users',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          showSymbol: false,
          symbolSize: 6,
          itemStyle: { color: '#d93c1d' },
          lineStyle: { width: 3, color: '#d93c1d' },
          areaStyle: {
            color: new this.echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(217, 60, 29, 0.35)' },
              { offset: 1, color: 'rgba(217, 60, 29, 0.01)' },
            ]),
          },
          data: users,
        },
        {
          name: 'Page Views',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.35,
          showSymbol: false,
          symbolSize: 6,
          itemStyle: { color: '#0ea5e9' },
          lineStyle: { width: 2.5, color: '#0ea5e9' },
          areaStyle: {
            color: new this.echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(14, 165, 233, 0.25)' },
              { offset: 1, color: 'rgba(14, 165, 233, 0.01)' },
            ]),
          },
          data: views,
        }
      );
    } else {
      let data: number[] = [];
      let name = '';
      let color = '#d93c1d';
      let gradientStart = 'rgba(217, 60, 29, 0.35)';

      if (metric === 'users') {
        data = users;
        name = 'Active Users';
        color = '#d93c1d';
        gradientStart = 'rgba(217, 60, 29, 0.35)';
      } else if (metric === 'sessions') {
        data = sessions;
        name = 'Sessions';
        color = '#10b981';
        gradientStart = 'rgba(16, 185, 129, 0.35)';
      } else if (metric === 'views') {
        data = views;
        name = 'Page Views';
        color = '#0ea5e9';
        gradientStart = 'rgba(14, 165, 233, 0.35)';
      }

      yAxis.push({
        type: 'value',
        name,
        nameTextStyle: { color: textColor, fontSize: axisFontSize },
        axisLabel: { color: textColor, fontSize: axisFontSize },
        splitLine: { lineStyle: { color: gridLineColor } },
      });

      series.push({
        name,
        type: 'line',
        smooth: 0.35,
        showSymbol: false,
        symbolSize: 7,
        itemStyle: { color },
        lineStyle: { width: 3, color },
        areaStyle: {
          color: new this.echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: gradientStart },
            { offset: 1, color: 'rgba(0, 0, 0, 0.01)' },
          ]),
        },
        data,
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: isMobile ? [8, 10] : [10, 14],
        textStyle: { color: textColor, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isMobile ? 12 : 13 },
        extraCssText: 'border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); backdrop-filter: blur(8px);',
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: textColor, fontSize: isMobile ? 10 : 12 },
        icon: 'roundRect',
        itemWidth: isMobile ? 14 : 25,
        itemHeight: isMobile ? 8 : 12,
      },
      grid: {
        left: isVerySmall ? '1%' : '2%',
        right: isVerySmall ? '1%' : (isMobile ? '2%' : '3%'),
        top: isMobile ? '18%' : '14%',
        bottom: isMobile ? '12%' : '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: gridLineColor } },
        axisLabel: {
          color: textColor,
          fontSize: isMobile ? 9 : 11,
          hideOverlap: true,
          interval: 'auto',
        },
      },
      yAxis,
      series,
    };

    this.mainChart.setOption(option, true);
  }

  private renderSourcesChart(): void {
    const container = this.sourcesChartRef?.nativeElement;
    const reportData = this.report();
    if (!container || !reportData?.trafficSources?.length || !this.echartsModule) return;

    if (!this.sourcesChart) {
      this.sourcesChart = this.echartsModule.init(container, undefined, { renderer: 'svg' });
    }

    const isDark = this.theme.dark();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    const isSmall = isPlatformBrowser(this.platformId) && window.innerWidth < 520;

    const colors = ['#d93c1d', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const data = reportData.trafficSources.map((s, index) => ({
      name: s.channelGroup,
      value: s.sessions,
      itemStyle: { color: colors[index % colors.length] },
    }));

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c} sessions</b> ({d}%)',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isSmall ? 12 : 13 },
        extraCssText: 'border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);',
      },
      legend: {
        bottom: '0%',
        left: 'center',
        textStyle: { color: textColor, fontSize: isSmall ? 10 : 11 },
        icon: 'circle',
        itemWidth: isSmall ? 8 : 10,
        itemHeight: isSmall ? 8 : 10,
      },
      series: [
        {
          name: 'Traffic Channels',
          type: 'pie',
          radius: isSmall ? ['42%', '68%'] : ['48%', '75%'],
          center: isSmall ? ['50%', '40%'] : ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? '#151c22' : '#ffffff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: isSmall ? 11 : 13,
              fontWeight: 'bold',
              color: textColor,
            },
          },
          data,
        },
      ],
    };

    this.sourcesChart.setOption(option, true);
  }

  private renderDeviceChart(): void {
    const container = this.deviceChartRef?.nativeElement;
    const reportData = this.report();
    if (!container || !reportData?.deviceBreakdown?.length || !this.echartsModule) return;

    if (!this.deviceChart) {
      this.deviceChart = this.echartsModule.init(container, undefined, { renderer: 'svg' });
    }

    const isDark = this.theme.dark();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    const isSmall = isPlatformBrowser(this.platformId) && window.innerWidth < 520;

    const deviceColors: Record<string, string> = {
      desktop: '#d93c1d',
      mobile: '#10b981',
      tablet: '#f59e0b',
    };

    const data = reportData.deviceBreakdown.map((d) => ({
      name: d.deviceCategory.charAt(0).toUpperCase() + d.deviceCategory.slice(1),
      value: d.users,
      itemStyle: { color: deviceColors[d.deviceCategory.toLowerCase()] || '#6366f1' },
    }));

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c} users</b> ({d}%)',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: isSmall ? 12 : 13 },
        extraCssText: 'border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);',
      },
      legend: {
        bottom: '0%',
        left: 'center',
        textStyle: { color: textColor, fontSize: isSmall ? 10 : 11 },
        icon: 'circle',
        itemWidth: isSmall ? 8 : 10,
        itemHeight: isSmall ? 8 : 10,
      },
      series: [
        {
          name: 'Device Type',
          type: 'pie',
          radius: isSmall ? ['42%', '68%'] : ['48%', '75%'],
          center: isSmall ? ['50%', '40%'] : ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? '#151c22' : '#ffffff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: isSmall ? 11 : 13,
              fontWeight: 'bold',
              color: textColor,
            },
          },
          data,
        },
      ],
    };

    this.deviceChart.setOption(option, true);
  }

  private destroyCharts(): void {
    this.resizeObserver?.disconnect();
    this.mainChart?.dispose();
    this.sourcesChart?.dispose();
    this.deviceChart?.dispose();
    this.mainChart = null;
    this.sourcesChart = null;
    this.deviceChart = null;
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  getDeviceIcon(category: string): string {
    switch (category.toLowerCase()) {
      case 'desktop':
        return 'computer';
      case 'mobile':
        return 'smartphone';
      case 'tablet':
        return 'tablet_mac';
      default:
        return 'devices';
    }
  }
}
