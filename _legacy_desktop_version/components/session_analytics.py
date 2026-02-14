import flet as ft
import database
import config
from datetime import datetime, timedelta

class SessionAnalytics(ft.UserControl):
    def __init__(self):
        super().__init__()
        self.view_mode = "list"
        self.session_list = [] 
        self.current_session_index = -1
        self.session_data = None
        
        self.main_container = ft.Container(expand=True)
        
        # Detail View State (Persisted)
        self.detail_runs = []
        self.chart_mode = "expl"
        self.show_trend = False
        self.hide_failures = False
        self.hide_world_loads = False 
        self.group_size = 1
        self.sort_option = "Newest" 
        
        # List View State
        self.show_splits_only = False 

    def did_mount(self):
        # Load persisted state after mount so page is available
        cfg = config.load_config(self.page)
        self.show_splits_only = cfg.get("show_splits_only", False)
        self.splits_button.selected = self.show_splits_only
        self._build_list_view()
        self.update()

    def build(self):
        self._build_list_view()
        return self.main_container

    # --- LIST VIEW ---
    def _build_list_view(self):
        self.view_mode = "list"
        self.session_list = database.get_session_index()
        
        # Filter Logic for "Splits Only"
        display_list = self.session_list
        if self.show_splits_only:
            display_list = [s for s in self.session_list if s['type'] == 'split']
        
        list_rows = []
        for i, sess in enumerate(display_list):
            # Map index back to original list for clicking
            original_index = self.session_list.index(sess)
            
            # Duration
            try:
                start = datetime.strptime(sess['start_time'], "%Y-%m-%d %H:%M:%S")
                end = datetime.strptime(sess['end_time'], "%Y-%m-%d %H:%M:%S")
                duration = end - start
                dur_str = str(duration).split('.')[0]
            except:
                dur_str = "0:00:00"

            total = sess['count']
            success = sess['success_count']
            rate = (success / total * 100) if total > 0 else 0.0
            
            rate_color = ft.colors.RED_400
            if rate > 30: rate_color = ft.colors.ORANGE_400
            if rate > 70: rate_color = ft.colors.GREEN_400

            icon = ft.icons.FOLDER if sess['type'] == 'file' else ft.icons.TIMER
            icon_color = ft.colors.BLUE_400 if sess['type'] == 'file' else ft.colors.ORANGE_400
            
            row = ft.Container(
                content=ft.Row([
                    ft.Row([
                        ft.Icon(icon, color=icon_color, size=20),
                        ft.Column([
                            ft.Text(sess['id'], weight="bold", size=14, width=280, no_wrap=True),
                            ft.Text(f"{sess['start_time']} • {dur_str}", size=11, color="grey")
                        ], spacing=2),
                    ]),
                    
                    ft.Container(expand=True),
                    
                    ft.Row([
                        ft.Column([
                            ft.Text("Runs", size=10, color="grey"),
                            ft.Text(f"{total}", weight="bold", size=14),
                        ], horizontal_alignment="center"),
                        ft.Container(width=10),
                        ft.Column([
                            ft.Text("Success %", size=10, color="grey"),
                            ft.Text(f"{rate:.1f}%", weight="bold", size=14, color=rate_color),
                        ], horizontal_alignment="center", width=70),
                        ft.Icon(ft.icons.CHEVRON_RIGHT, color="grey")
                    ], alignment=ft.MainAxisAlignment.END)
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                padding=10,
                border_radius=5,
                bgcolor=ft.colors.GREY_900,
                ink=True,
                on_click=lambda e, idx=original_index: self.load_session_detail(idx)
            )
            list_rows.append(row)

        # Header with Toggle
        self.splits_button = ft.IconButton(
            icon=ft.icons.TIMER_OUTLINED,
            icon_color="white",
            selected_icon=ft.icons.TIMER,
            selected_icon_color="orange",
            selected=self.show_splits_only,
            tooltip="Splits Only",
            on_click=self.on_splits_click
        )

        header = ft.Row([
            ft.Text("Session History", size=20, weight="bold"),
            ft.Row([
                self.splits_button,
            ])
        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN)

        self.main_container.content = ft.Column([
            header,
            ft.Divider(),
            ft.ListView(controls=list_rows, expand=True, spacing=5)
        ], expand=True)

    def on_splits_click(self, e):
        self.show_splits_only = not self.show_splits_only
        self.splits_button.selected = self.show_splits_only
        
        # Persist
        config.save_config(self.page, {"show_splits_only": self.show_splits_only})
        
        self.splits_button.update()
        self._build_list_view()
        self.update()

    def refresh_list(self):
        self._build_list_view()
        self.update()

    # --- DETAIL VIEW (Unchanged Logic, just re-stating for completeness) ---
    def load_session_detail(self, index):
        if index < 0 or index >= len(self.session_list):
            return
            
        self.view_mode = "detail"
        self.current_session_index = index
        self.session_data = self.session_list[index]
        
        self.detail_runs = database.get_runs_by_session(self.session_data['id'], self.session_data['type'])
        
        # Header with Nav
        nav_row = ft.Row([
            ft.IconButton(ft.icons.ARROW_BACK, tooltip="Back to List", on_click=lambda e: self.show_list()),
            ft.Container(width=10),
            ft.IconButton(
                ft.icons.CHEVRON_LEFT, 
                tooltip="Next Session (Newer)",
                disabled=(index == 0), 
                on_click=lambda e: self.load_session_detail(index - 1)
            ),
             ft.IconButton(
                ft.icons.CHEVRON_RIGHT, 
                tooltip="Prev Session (Older)",
                disabled=(index >= len(self.session_list) - 1), 
                on_click=lambda e: self.load_session_detail(index + 1)
            ),
            ft.Container(width=20),
            ft.Column([
                ft.Text(self.session_data['id'], size=18, weight="bold", no_wrap=True),
                ft.Text(f"{self.session_data['start_time']}", color="grey", size=12)
            ], spacing=0, alignment=ft.MainAxisAlignment.CENTER)
        ], alignment=ft.MainAxisAlignment.START)

        # Controls
        self.chart_toggle = ft.SegmentedButton(
            selected={self.chart_mode},
            show_selected_icon=False,
            segments=[
                ft.Segment(value="expl", label=ft.Text("Expl")),
                ft.Segment(value="time", label=ft.Text("Time")),
            ],
            on_change=self.on_chart_mode_change
        )
        
        self.trend_button = ft.IconButton(
            icon=ft.icons.TIMELINE,
            icon_color="white",
            selected_icon=ft.icons.TIMELINE,
            selected_icon_color="cyan",
            selected=self.show_trend,
            tooltip="Toggle Trend Line",
            on_click=self.on_trend_click
        )
        
        self.group_input = ft.TextField(
            label="Group", value=str(self.group_size), width=60, text_size=12, content_padding=5,
            keyboard_type=ft.KeyboardType.NUMBER, on_submit=self.on_group_submit, on_blur=self.on_group_submit
        )

        self.sort_dropdown = ft.Dropdown(
            width=120,
            text_size=12,
            value=self.sort_option,
            options=[
                ft.dropdown.Option("Newest"),
                ft.dropdown.Option("Oldest"),
                ft.dropdown.Option("Time"),
                ft.dropdown.Option("Expl"),
                ft.dropdown.Option("Height"),
            ],
            on_change=self.on_sort_change,
            content_padding=5,
            height=35
        )

        self.hide_fails_button = ft.IconButton(
            icon=ft.icons.FILTER_ALT_OFF,
            icon_color="white",
            selected_icon=ft.icons.FILTER_ALT,
            selected_icon_color="red",
            selected=self.hide_failures,
            tooltip="Hide Fails",
            on_click=self.on_hide_fail_click
        )
        self.hide_wl_button = ft.IconButton(
            icon=ft.icons.PUBLIC_OFF,
            icon_color="white",
            selected_icon=ft.icons.PUBLIC_OFF,
            selected_icon_color="blue",
            selected=self.hide_world_loads,
            tooltip="Hide World Loads",
            on_click=self.on_hide_wl_click
        )

        controls_row = ft.Row([
            ft.Row([self.chart_toggle, self.trend_button, self.group_input], alignment=ft.MainAxisAlignment.START, spacing=15),
            ft.Container(expand=True),
            ft.Row([
                ft.Text("Sort:", size=12, color="grey"),
                self.sort_dropdown,
                ft.Container(width=10),
                self.hide_wl_button,
                self.hide_fails_button
            ], vertical_alignment=ft.CrossAxisAlignment.CENTER)
        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN)

        self.chart_container = ft.Container(height=220, padding=10, bgcolor=ft.colors.BLACK54, border_radius=8)
        self.stats_container = ft.Row(alignment=ft.MainAxisAlignment.SPACE_EVENLY, spacing=30)

        self.runs_table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("Result")),
                ft.DataColumn(ft.Text("Expl"), numeric=True),
                ft.DataColumn(ft.Text("Time"), numeric=True),
                ft.DataColumn(ft.Text("Height"), numeric=True),
                ft.DataColumn(ft.Text("Tower")),
                ft.DataColumn(ft.Text("Type")),
            ],
            rows=[],
            column_spacing=25, 
            heading_row_height=30,
            data_row_min_height=35,
        )

        self.main_container.content = ft.Column([
            nav_row,
            ft.Divider(height=15, color="transparent"),
            controls_row,
            self.chart_container,
            ft.Divider(height=15, color="transparent"),
            self.stats_container,
            ft.Divider(),
            ft.Container(content=ft.Column([self.runs_table], scroll=ft.ScrollMode.ADAPTIVE), expand=True)
        ], expand=True)
        
        self._refresh_detail_content()
        self.update()

    # --- EVENT HANDLERS (Same as before) ---
    def on_chart_mode_change(self, e):
        self.chart_mode = list(e.control.selected)[0]
        self._refresh_detail_content()
        self.update()

    def on_trend_click(self, e):
        self.show_trend = not self.show_trend
        self.trend_button.selected = self.show_trend
        self.trend_button.update()
        self._refresh_detail_content()
        self.update()
    
    def on_hide_fail_click(self, e):
        self.hide_failures = not self.hide_failures
        self.hide_fails_button.selected = self.hide_failures
        self.hide_fails_button.update()
        self._refresh_detail_content()
        self.update()
    
    def on_hide_wl_click(self, e):
        self.hide_world_loads = not self.hide_world_loads
        self.hide_wl_button.selected = self.hide_world_loads
        self.hide_wl_button.update()
        self._refresh_detail_content()
        self.update()

    def on_sort_change(self, e):
        self.sort_option = e.control.value
        self._refresh_detail_content()
        self.update()

    def on_group_submit(self, e):
        try:
            val = int(e.control.value)
            if val < 1: val = 1
            self.group_size = val
        except:
            self.group_size = 1
            e.control.value = "1"
            e.control.update()
        self._refresh_detail_content()
        self.update()

    # --- REFRESH LOGIC (Same as before) ---
    def _refresh_detail_content(self):
        active_runs = list(self.detail_runs)
        if self.hide_world_loads:
            active_runs = [r for r in active_runs if r[10] != "World Load"]

        total_runs = len(active_runs)
        successes = [r for r in active_runs if r[9]]
        deaths = [r for r in active_runs if r[10] == "Death"]
        death_count = len(deaths)
        
        success_rate = (len(successes) / total_runs * 100) if total_runs > 0 else 0.0
        death_rate = (death_count / total_runs * 100) if total_runs > 0 else 0.0
        
        heights = [r[7] for r in active_runs if r[7] > 0]
        avg_height = sum(heights) / len(heights) if heights else 0
        
        # Session Time Calc (Smart)
        time_sorted_runs = sorted(active_runs, key=lambda x: x[1])
        session_time_seconds = 0
        if time_sorted_runs:
            current_chunk_start = datetime.strptime(time_sorted_runs[0][1], "%Y-%m-%d %H:%M:%S")
            current_chunk_end = current_chunk_start + timedelta(seconds=time_sorted_runs[0][2])
            
            for i in range(1, len(time_sorted_runs)):
                run_start = datetime.strptime(time_sorted_runs[i][1], "%Y-%m-%d %H:%M:%S")
                run_duration = time_sorted_runs[i][2]
                run_end = run_start + timedelta(seconds=run_duration)
                gap = (run_start - current_chunk_end).total_seconds()
                
                if gap > 1800:
                    chunk_duration = (current_chunk_end - current_chunk_start).total_seconds()
                    session_time_seconds += chunk_duration
                    current_chunk_start = run_start
                    current_chunk_end = run_end
                else:
                    if run_end > current_chunk_end:
                        current_chunk_end = run_end
            
            chunk_duration = (current_chunk_end - current_chunk_start).total_seconds()
            session_time_seconds += chunk_duration

        m, s = divmod(session_time_seconds, 60)
        h, m = divmod(m, 60)
        dur_str = f"{int(h)}:{int(m):02d}:{int(s):02d}"

        self.stats_container.controls = [
            self._stat_card("Total Runs", str(total_runs), ft.colors.WHITE),
            self._stat_card("Success Rate", f"{success_rate:.1f}%", ft.colors.GREEN_400 if success_rate > 50 else ft.colors.ORANGE_400),
            self._stat_card("Death Rate", f"{death_rate:.1f}%", ft.colors.RED_400),
            self._stat_card("Avg Height", f"{int(avg_height)}", ft.colors.CYAN_400),
            self._stat_card("Session Time", dur_str, ft.colors.GREY_400),
        ]

        # Chart
        chart_data_source = sorted(successes, key=lambda x: x[1])
        y_values = []
        if self.chart_mode == "expl":
            y_values = [r[4] for r in chart_data_source if r[4] > 0]
            chart_color = ft.colors.CYAN_400
            y_title = "Explosives"
        else:
            y_values = [r[2] for r in chart_data_source]
            chart_color = ft.colors.PURPLE_400
            y_title = "Time (s)"

        points = []
        final_coords = []
        
        if self.group_size > 1:
            for i in range(0, len(y_values), self.group_size):
                chunk = y_values[i : i + self.group_size]
                if chunk:
                    avg = sum(chunk) / len(chunk)
                    points.append(ft.LineChartDataPoint(x=i, y=avg))
                    final_coords.append((i, avg))
        else:
            for i, val in enumerate(y_values):
                points.append(ft.LineChartDataPoint(x=i, y=val))
                final_coords.append((i, val))

        data_series = [
            ft.LineChartData(
                data_points=points,
                stroke_width=2,
                color=chart_color,
                curved=True,
                stroke_cap_round=True,
                below_line_bgcolor=ft.colors.with_opacity(0.1, chart_color),
            )
        ]

        if self.show_trend and len(final_coords) > 1:
            n = len(final_coords)
            sum_x = sum(x for x, y in final_coords)
            sum_y = sum(y for x, y in final_coords)
            sum_xy = sum(x*y for x, y in final_coords)
            sum_xx = sum(x*x for x, y in final_coords)
            denom = (n * sum_xx - sum_x * sum_x)
            if denom != 0:
                m = (n * sum_xy - sum_x * sum_y) / denom
                b = (sum_y - m * sum_x) / n
                start_x, end_x = final_coords[0][0], final_coords[-1][0]
                data_series.append(ft.LineChartData(
                    data_points=[ft.LineChartDataPoint(x=start_x, y=m*start_x+b), ft.LineChartDataPoint(x=end_x, y=m*end_x+b)],
                    stroke_width=1, color=ft.colors.WHITE54, dash_pattern=[5, 5]
                ))

        chart = ft.LineChart(
            data_series=data_series,
            border=ft.border.all(1, ft.colors.GREY_800),
            left_axis=ft.ChartAxis(labels_size=30, title=ft.Text(y_title, size=10)),
            bottom_axis=ft.ChartAxis(labels_size=0),
            tooltip_bgcolor=ft.colors.GREY_800,
            expand=True
        )
        self.chart_container.content = chart

        # Table
        table_runs = list(active_runs)
        if self.hide_failures:
            table_runs = [r for r in table_runs if r[9]]

        if self.sort_option == "Newest":
            table_runs.sort(key=lambda x: (x[1], x[0]), reverse=True)
        elif self.sort_option == "Oldest":
            table_runs.sort(key=lambda x: (x[1], x[0]), reverse=False)
        elif self.sort_option == "Time":
            table_runs.sort(key=lambda x: (not x[9], x[2])) 
        elif self.sort_option == "Expl":
            table_runs.sort(key=lambda x: (not x[9], x[4]))
        elif self.sort_option == "Height":
            table_runs.sort(key=lambda x: x[7], reverse=True)
        
        new_rows = []
        for run in table_runs:
            is_success = bool(run[9])
            time_val = run[2]
            expl_str = run[3]
            tower = run[5]
            r_type = run[6]
            height = run[7]
            fail_reason = run[10]

            if is_success:
                res_content = ft.Text("CLEARED", color=ft.colors.GREEN_400, weight="bold", size=12)
                row_bg = ft.colors.with_opacity(0.05, ft.colors.GREEN_400)
            else:
                res_content = ft.Text(f"{fail_reason}", color=ft.colors.RED_400, size=12)
                row_bg = ft.colors.TRANSPARENT

            new_rows.append(
                ft.DataRow(
                    color=row_bg,
                    cells=[
                        ft.DataCell(res_content),
                        ft.DataCell(ft.Text(expl_str if expl_str != "?" else "-")),
                        ft.DataCell(ft.Text(f"{time_val:.2f}s")),
                        ft.DataCell(ft.Text(str(height))),
                        ft.DataCell(ft.Text(tower if tower != "Unknown" else "-")),
                        ft.DataCell(ft.Text(r_type if r_type != "Unknown" else "-")),
                    ],
                )
            )
        self.runs_table.rows = new_rows

    def _stat_card(self, label, value, color):
        return ft.Column([
            ft.Text(label, size=11, color="grey"),
            ft.Text(value, size=20, weight="bold", color=color)
        ], horizontal_alignment="center")

    def show_list(self):
        self._build_list_view()
        self.update()