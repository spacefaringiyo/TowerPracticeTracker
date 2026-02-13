import flet as ft
import database

class HeightAnalytics(ft.UserControl):
    def __init__(self):
        super().__init__()
        self.view_mode = "list" # list or detail
        self.current_height = None
        self.all_runs = []
        self.active_types = set()
        self.active_towers = set() 
        
        # State
        self.detail_sort_option = "Newest"
        self.list_sort_option = "Height"
        self.list_sort_column_index = 0
        self.list_sort_ascending = True
        self.chart_mode = "expl" 
        self.hide_failures = False
        self.show_trend = False
        self.group_size = 1
        self.height_list = [] # Sorted heights for navigation
        
        self.main_container = ft.Container(expand=True)

    def build(self):
        self._build_list()
        return self.main_container

    def show_list(self):
        self._build_list()
        self.update()

    def _build_list(self):
        self.view_mode = "list"
        self.current_height = None
        
        # Get stats: (height, count, min_time, min_expl)
        raw_stats = database.get_height_stats()
        
        height_data = []
        for h, count, best_time, best_expl in raw_stats:
            runs = database.get_runs_by_height(h)
            
            avg_time = 0
            avg_expl = 0
            
            valid_time_runs = [r for r in runs if r[2] > 0]
            if valid_time_runs:
                avg_time = sum(r[2] for r in valid_time_runs) / len(valid_time_runs)
                
            if runs:
                avg_expl = sum(r[4] for r in runs) / len(runs)
                
            height_data.append({
                "height": h,
                "count": count,
                "best_time": best_time,
                "avg_time": avg_time,
                "best_expl": best_expl,
                "avg_expl": avg_expl
            })

        # Sort Logic
        col_keys = ["height", "count", "best_expl", "avg_expl", "best_time", "avg_time"]
        
        # Sync index with option if changed via dropdown
        if hasattr(self, '_last_sort_from_dropdown') and self._last_sort_from_dropdown:
            if self.list_sort_option == "Height": self.list_sort_column_index = 0
            elif self.list_sort_option == "Most Runs": self.list_sort_column_index = 1
            elif self.list_sort_option == "Best Expl": self.list_sort_column_index = 2
            elif self.list_sort_option == "Best Time": self.list_sort_column_index = 4
            self._last_sort_from_dropdown = False
            self.list_sort_ascending = (self.list_sort_option != "Most Runs")

        key = col_keys[self.list_sort_column_index]
        height_data.sort(key=lambda x: x[key], reverse=not self.list_sort_ascending)
        
        self.height_list = [d['height'] for d in height_data]

        rows = []
        for d in height_data:
            rows.append(ft.DataRow(
                cells=[
                    ft.DataCell(ft.Text(str(d['height']))),
                    ft.DataCell(ft.Text(str(d['count']), color="grey")),
                    ft.DataCell(ft.Text(str(d['best_expl']), color=ft.colors.CYAN_400)),
                    ft.DataCell(ft.Text(f"{d['avg_expl']:.1f}")),
                    ft.DataCell(ft.Text(f"{d['best_time']:.2f}s", color=ft.colors.AMBER_400 if d['best_time'] > 0 else "grey")),
                    ft.DataCell(ft.Text(f"{d['avg_time']:.2f}s")),
                ],
                on_select_changed=lambda e, h=d['height']: self.show_detail(h)
            ))

        data_table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("Height", weight="bold"), on_sort=self.on_list_sort, numeric=True),
                ft.DataColumn(ft.Text("Suc. Runs"), on_sort=self.on_list_sort, numeric=True),
                ft.DataColumn(ft.Text("Best Expl"), on_sort=self.on_list_sort, numeric=True),
                ft.DataColumn(ft.Text("Avg Expl"), on_sort=self.on_list_sort, numeric=True),
                ft.DataColumn(ft.Text("Best Time"), on_sort=self.on_list_sort, numeric=True),
                ft.DataColumn(ft.Text("Avg Time"), on_sort=self.on_list_sort, numeric=True),
            ],
            rows=rows,
            sort_column_index=self.list_sort_column_index,
            sort_ascending=self.list_sort_ascending,
            heading_row_color=ft.colors.BLACK54,
            heading_row_height=40,
            data_row_min_height=40,
            column_spacing=20,
            show_checkbox_column=False,
        )

        sort_dropdown = ft.Dropdown(
            width=140, text_size=12, value=self.list_sort_option,
            options=[
                ft.dropdown.Option("Height"),
                ft.dropdown.Option("Most Runs"),
                ft.dropdown.Option("Best Expl"),
                ft.dropdown.Option("Best Time"),
            ],
            on_change=self.on_list_sort_dropdown_change, content_padding=5
        )

        header_row = ft.Row([
            ft.Text("Height Analytics", size=20, weight="bold"),
            ft.Container(expand=True),
            ft.Text("Sort: ", size=12, color="grey"),
            sort_dropdown
        ])
        
        self.main_container.content = ft.Column([
            header_row,
            ft.Divider(),
            ft.Container(
                content=ft.Column([
                    ft.Row([data_table], alignment=ft.MainAxisAlignment.START)
                ], scroll=ft.ScrollMode.ADAPTIVE),
                expand=True
            )
        ], expand=True)

    def on_list_sort(self, e):
        self.list_sort_column_index = e.column_index
        self.list_sort_ascending = e.ascending
        
        # Update dropdown value to match if possible
        col_to_opt = {0: "Height", 1: "Most Runs", 2: "Best Expl", 4: "Best Time"}
        if e.column_index in col_to_opt:
            self.list_sort_option = col_to_opt[e.column_index]
            
        self._last_sort_from_header = True
        self.show_list()

    def on_list_sort_dropdown_change(self, e):
        self.list_sort_option = e.control.value
        self._last_sort_from_dropdown = True
        self.show_list()

    def show_detail(self, height):
        self.view_mode = "detail"
        self.current_height = height
        self.all_runs = database.get_runs_by_height(height)
        
        # Populate filter sets
        self.active_types = set(r[6] for r in self.all_runs if r[6] and r[6] != "Unknown")
        self.active_towers = set(r[5] for r in self.all_runs if r[5] and r[5] != "Unknown")
        
        # Build relationship maps for propagation
        self.tower_to_types = {}
        self.type_to_towers = {}
        for r in self.all_runs:
            t, rt = r[5], r[6]
            if t not in self.tower_to_types: self.tower_to_types[t] = set()
            self.tower_to_types[t].add(rt)
            if rt not in self.type_to_towers: self.type_to_towers[rt] = set()
            self.type_to_towers[rt].add(t)

        # --- UI CONTROLS ---
        height_index = self.height_list.index(height) if height in self.height_list else -1
        
        nav_header = ft.Row([
            ft.IconButton(ft.icons.ARROW_BACK, tooltip="Back to Comparison", on_click=lambda e: self.show_list()),
            ft.Container(width=10),
            ft.IconButton(
                ft.icons.CHEVRON_LEFT, 
                tooltip="Next Height (Up)",
                disabled=(height_index <= 0), 
                on_click=lambda e: self.show_detail(self.height_list[height_index - 1])
            ),
            ft.IconButton(
                ft.icons.CHEVRON_RIGHT, 
                tooltip="Prev Height (Down)",
                disabled=(height_index == -1 or height_index >= len(self.height_list) - 1), 
                on_click=lambda e: self.show_detail(self.height_list[height_index + 1])
            ),
            ft.Container(width=10),
            ft.Text(f"Height {height}", size=24, weight="bold"),
        ], alignment=ft.MainAxisAlignment.START)
        
        # Filters Containers
        self.filter_container_types = ft.Row(wrap=True)
        self.filter_container_towers = ft.Row(wrap=True)
        
        # Tower filters scrollable box
        tower_scroll = ft.Container(
             content=ft.Column([self.filter_container_towers], scroll=ft.ScrollMode.AUTO),
             height=100, border=ft.border.all(1, ft.colors.GREY_800),
             border_radius=5, padding=5
        )

        # Controls
        self.chart_toggle = ft.SegmentedButton(
            selected={self.chart_mode}, show_selected_icon=False,
            segments=[
                ft.Segment(value="expl", label=ft.Text("Explosives")),
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
            label="Group", value=str(self.group_size), width=60, 
            text_size=12, content_padding=5, keyboard_type=ft.KeyboardType.NUMBER,
            on_submit=self.on_group_submit, on_blur=self.on_group_submit
        )
        self.detail_sort_dropdown = ft.Dropdown(
            width=100, text_size=12, value=self.detail_sort_option,
            options=[
                ft.dropdown.Option("Newest"),
                ft.dropdown.Option("Oldest"),
                ft.dropdown.Option("Best Expl"),
                ft.dropdown.Option("Best Time"),
            ],
            on_change=self.on_detail_sort_change, content_padding=5
        )
        
        controls_row = ft.Row([
            self.chart_toggle, ft.Container(width=10),
            self.trend_button, self.group_input,
            ft.Container(expand=True),
            self.detail_sort_dropdown
        ])
        
        self.chart_container = ft.Container(height=300, padding=10, bgcolor=ft.colors.BLACK54, border_radius=8)
        self.stats_container = ft.Row(alignment=ft.MainAxisAlignment.SPACE_AROUND)
        self.list_container = ft.Column(scroll=ft.ScrollMode.AUTO, expand=True)

        list_header = ft.Container(
            content=ft.Row([
                ft.Text("Expl", width=50, weight="bold", color="grey"),
                ft.Text("Time", width=100, weight="bold", color="grey"),
                ft.Text("Bed", width=60, weight="bold", color="grey"),
                ft.Text("Tower", width=80, weight="bold", color="grey"),
                ft.Text("Type", expand=True, weight="bold", color="grey"),
                ft.Text("Date", width=120, weight="bold", color="grey"),
            ]),
            padding=ft.padding.only(left=5, bottom=5)
        )

        self.main_container.content = ft.Column([
            nav_header,
            # Unified All/None
            ft.Row([
                ft.Text("Filters", weight="bold"),
                ft.TextButton("All", on_click=lambda _: self.toggle_all_unified(True), style=ft.ButtonStyle(padding=5)),
                ft.TextButton("None", on_click=lambda _: self.toggle_all_unified(False), style=ft.ButtonStyle(padding=5)),
            ], spacing=20),
            
            # Tower Filters (First)
            ft.Row([ft.Text("Towers:", size=12, color="grey"), self.filter_container_towers], wrap=True),
            
            # Type Filters (Second)
            ft.Row([ft.Text("Types:", size=12, color="grey"), self.filter_container_types], wrap=True),
            
            ft.Container(height=10),
            controls_row,
            self.chart_container,
            ft.Divider(height=10, color="transparent"),
            self.stats_container,
            ft.Divider(),
            ft.Row([ft.Text("Run History", weight="bold"), ft.Container(expand=True)]),
            list_header,
            self.list_container
        ], expand=True)
        
        self._build_type_filters()
        self._build_tower_filters()
        self._refresh_detail_content()
        self.update()

    def _build_type_filters(self):
        controls = []
        all_types = sorted(list(self.type_to_towers.keys()))
        for t in all_types:
            is_active = t in self.active_types
            btn = self._make_filter_chip(t, is_active, lambda e, x=t: self.toggle_type(x))
            controls.append(btn)
        self.filter_container_types.controls = controls
        
    def _build_tower_filters(self):
        controls = []
        all_towers = sorted(list(self.tower_to_types.keys()))
        for t in all_towers:
            is_active = t in self.active_towers
            btn = self._make_filter_chip(t, is_active, lambda e, x=t: self.toggle_tower(x))
            controls.append(btn)
        self.filter_container_towers.controls = controls

    def _make_filter_chip(self, label, active, on_click):
        bg = ft.colors.BLUE_700 if active else ft.colors.TRANSPARENT
        border = ft.colors.BLUE_700 if active else ft.colors.GREY_700
        return ft.Container(
            content=ft.Text(label, size=12, color="white" if active else "grey"),
            padding=5, border_radius=12, bgcolor=bg, border=ft.border.all(1, border),
            ink=True, on_click=on_click
        )

    def toggle_type(self, val):
        if val in self.active_types:
            self.active_types.remove(val)
            for tower in self.type_to_towers.get(val, []):
                if tower in self.active_towers:
                    if not any(rt in self.active_types for rt in self.tower_to_types.get(tower, [])):
                        self.active_towers.remove(tower)
        else:
            self.active_types.add(val)
            for tower in self.type_to_towers.get(val, []):
                self.active_towers.add(tower)
        self._build_type_filters(); self._build_tower_filters(); self._refresh_detail_content(); self.update()

    def toggle_tower(self, val):
        if val in self.active_towers:
            self.active_towers.remove(val)
            for rtype in self.tower_to_types.get(val, []):
                if rtype in self.active_types:
                    if not any(t in self.active_towers for t in self.type_to_towers.get(rtype, [])):
                        self.active_types.remove(rtype)
        else:
            self.active_towers.add(val)
            for rtype in self.tower_to_types.get(val, []):
                self.active_types.add(rtype)
        self._build_type_filters(); self._build_tower_filters(); self._refresh_detail_content(); self.update()

    def toggle_all_unified(self, active):
        if active:
            self.active_types = set(self.type_to_towers.keys())
            self.active_towers = set(self.tower_to_types.keys())
        else:
            self.active_types = set(); self.active_towers = set()
        self._build_type_filters(); self._build_tower_filters(); self._refresh_detail_content(); self.update()

    def on_chart_mode_change(self, e):
        self.chart_mode = list(e.control.selected)[0]
        self._refresh_detail_content(); self.update()

    def on_detail_sort_change(self, e):
        self.detail_sort_option = self.detail_sort_dropdown.value
        self._refresh_detail_content(); self.update()

    def on_trend_click(self, e):
        self.show_trend = not self.show_trend
        self.trend_button.selected = self.show_trend
        self.trend_button.update()
        self._refresh_detail_content(); self.update()

    def on_group_submit(self, e):
        try:
            val = int(e.control.value)
            if val < 1: val = 1
            self.group_size = val
        except:
            self.group_size = 1; e.control.value="1"; e.control.update()
        self._refresh_detail_content(); self.update()

    def _refresh_detail_content(self):
        filtered_runs = [r for r in self.all_runs if r[6] in self.active_types and r[5] in self.active_towers]
        success_count = len(filtered_runs)
        avg_expl_val = 0; avg_time_val = 0; best_expl_val = 0; best_time_val = 0
        if success_count > 0:
            avg_expl_val = sum(r[4] for r in filtered_runs) / success_count
            best_expl_val = min(r[4] for r in filtered_runs)
            valid_time_runs = [r for r in filtered_runs if r[2] > 0]
            if valid_time_runs:
                avg_time_val = sum(r[2] for r in valid_time_runs) / len(valid_time_runs)
                best_time_val = min(r[2] for r in valid_time_runs)
            
        self.stats_container.controls = [
            ft.Column([ft.Text("Suc. Runs", color="grey"), ft.Text(f"{success_count}", size=20, weight="bold")], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ft.VerticalDivider(width=20, color="grey"),
            ft.Row([
                ft.Column([ft.Text("Best Expl", color="grey", size=12), ft.Text(f"{best_expl_val}", size=16, weight="bold", color=ft.colors.CYAN_400)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Column([ft.Text("Avg Expl", color="grey", size=12), ft.Text(f"{avg_expl_val:.2f}", size=16, weight="bold")], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ], spacing=20),
            ft.VerticalDivider(width=20, color="grey"),
            ft.Row([
                 ft.Column([ft.Text("Best Time", color="grey", size=12), ft.Text(f"{best_time_val:.2f}s", size=16, weight="bold", color=ft.colors.AMBER_400)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Column([ft.Text("Avg Time", color="grey", size=12), ft.Text(f"{avg_time_val:.2f}s", size=16, weight="bold")], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ], spacing=20),
        ]
        self._build_chart(filtered_runs)
        self._build_run_list(filtered_runs)
        
    def _build_chart(self, successes):
        chart_data_source = sorted(successes, key=lambda x: x[1])
        y_values = []
        if self.chart_mode == "expl":
            y_values = [r[4] for r in chart_data_source if r[4] > 0]
            y_title = "Explosives"; chart_color = ft.colors.CYAN_400
        else:
            y_values = [r[2] for r in chart_data_source]
            y_title = "Time (s)"; chart_color = ft.colors.PURPLE_400
            
        points = []
        final_y_values = [] 
        if self.group_size > 1:
            for i in range(0, len(y_values), self.group_size):
                chunk = y_values[i : i + self.group_size]
                if chunk:
                    avg = sum(chunk) / len(chunk)
                    points.append(ft.LineChartDataPoint(x=i, y=avg))
                    final_y_values.append((i, avg))
        else:
            for i, val in enumerate(y_values):
                points.append(ft.LineChartDataPoint(x=i, y=val))
                final_y_values.append((i, val))
                
        data_series = [ft.LineChartData(data_points=points, stroke_width=2, color=chart_color, curved=True, stroke_cap_round=True, below_line_bgcolor=ft.colors.with_opacity(0.1, chart_color))]
        
        if self.show_trend and len(final_y_values) > 1:
            n = len(final_y_values); sum_x = sum(x for x, y in final_y_values); sum_y = sum(y for x, y in final_y_values); sum_xy = sum(x*y for x, y in final_y_values); sum_xx = sum(x*x for x, y in final_y_values); denom = (n * sum_xx - sum_x * sum_x)
            if denom != 0:
                m = (n * sum_xy - sum_x * sum_y) / denom; b = (sum_y - m * sum_x) / n; start_x = final_y_values[0][0]; end_x = final_y_values[-1][0]
                data_series.append(ft.LineChartData(data_points=[ft.LineChartDataPoint(x=start_x, y=m*start_x + b), ft.LineChartDataPoint(x=end_x, y=m*end_x + b)], stroke_width=2, color=ft.colors.WHITE54, dash_pattern=[5, 5], curved=False))

        self.chart_container.content = ft.LineChart(data_series=data_series, border=ft.border.all(1, ft.colors.GREY_800), left_axis=ft.ChartAxis(labels_size=30, title=ft.Text(y_title, size=10)), bottom_axis=ft.ChartAxis(title=ft.Text(f"Runs", size=10), labels_size=0), tooltip_bgcolor=ft.colors.GREY_800, expand=True)

    def _build_run_list(self, runs):
        sorted_runs = list(runs)
        if self.detail_sort_option == "Newest": sorted_runs.sort(key=lambda x: (x[1], x[0]), reverse=True)
        elif self.detail_sort_option == "Oldest": sorted_runs.sort(key=lambda x: (x[1], x[0]), reverse=False)
        elif self.detail_sort_option == "Best Expl": sorted_runs.sort(key=lambda x: x[4], reverse=False)
        elif self.detail_sort_option == "Best Time": sorted_runs.sort(key=lambda x: x[2] if x[2] > 0 else 999, reverse=False)

        list_rows = []
        for run in sorted_runs:
            row = ft.Container(
                content=ft.Row([
                    ft.Text(f"{run[3]}", width=50, weight="bold", color=ft.colors.CYAN_200, size=16),
                    ft.Text(f"{run[2]:.2f}s", width=100, weight="bold"),
                    ft.Text(f"{run[8]:.2f}s" if run[8] else "-", width=60, color=ft.colors.ORANGE_300),
                    ft.Text(f"{run[5]}", width=80, color="grey"),
                    ft.Text(f"{run[6]}", expand=True, size=14),
                    ft.Text(run[1], width=120, size=12, color="grey")
                ]),
                padding=10, border=ft.border.only(bottom=ft.border.BorderSide(1, "#333333"))
            )
            list_rows.append(row)
        self.list_container.controls = list_rows
