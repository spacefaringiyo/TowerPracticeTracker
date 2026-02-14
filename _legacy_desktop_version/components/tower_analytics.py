import flet as ft
import database
import config

class TowerAnalytics(ft.UserControl):
    def __init__(self):
        super().__init__()
        self.view_mode = "grid"
        self.current_tower = None
        self.all_runs = []
        self.active_types = set()
        
        # State
        self.detail_sort_option = "Newest"
        self.grid_sort_option = "Most Runs" 
        self.chart_mode = "expl" 
        self.hide_failures = False
        self.show_trend = False
        self.group_size = 1 # Default 1 means no grouping
        self.tower_names = [] # Sorted names for navigation
        
        self.main_container = ft.Container(expand=True)

    def did_mount(self):
        # Load persisted state
        cfg = config.load_config(self.page)
        self.chart_mode = cfg.get("chart_mode", "expl")
        self.update()

    def build(self):
        self._build_grid()
        return self.main_container

    def show_grid(self):
        self._build_grid()
        self.update()

    def _build_grid(self):
        self.view_mode = "grid"
        self.current_tower = None
        
        basic_stats = database.get_tower_stats()
        tower_data = {}

        for t_name, _, _ in basic_stats:
            runs = database.get_runs_by_tower(t_name)
            total_count = len(runs)
            success_runs = [r for r in runs if r[9]] # is_success=1
            success_count = len(success_runs)
            
            if success_count == 0:
                continue

            # Calculate Stats
            # Calculate Stats
            avg_expl = sum(r[4] for r in success_runs) / success_count
            
            valid_time_runs = [r for r in success_runs if r[2] > 0]
            if valid_time_runs:
                avg_time = sum(r[2] for r in valid_time_runs) / len(valid_time_runs)
                best_time = min(r[2] for r in valid_time_runs)
            else:
                avg_time = 0
                best_time = 0
            
            best_expl = min(r[4] for r in success_runs)
            
            tower_data[t_name] = {
                'total': success_count, # Re-purposed as successful count
                'avg_expl': avg_expl,
                'avg_time': avg_time,
                'best_expl': best_expl,
                'best_time': best_time
            }

        stats_list = []
        for t_name, data in tower_data.items():
            stats_list.append((t_name, data))

        # Sort Logic
        if self.grid_sort_option == "Most Runs":
            stats_list.sort(key=lambda x: x[1]['total'], reverse=True)
        elif self.grid_sort_option == "Best Time":
            stats_list.sort(key=lambda x: x[1]['best_time'], reverse=False)
        elif self.grid_sort_option == "Best Avg Expl":
            stats_list.sort(key=lambda x: x[1]['avg_expl'], reverse=False)
        elif self.grid_sort_option == "Alphabetical":
            stats_list.sort(key=lambda x: x[0], reverse=False)
            
        self.tower_names = [x[0] for x in stats_list]

        cards = []
        for t_name, data in stats_list:

            
            card_content = ft.Column([
                ft.Text(t_name, size=20, weight="bold", no_wrap=True, text_align="center"),
                ft.Divider(height=5, color="transparent"),
                
                # Stats Grid
                ft.Row([
                    # Expl Column (Left)
                    ft.Column([
                        ft.Text("Best Expl", size=12, color="grey"),
                        ft.Text(f"{data.get('best_expl', '-')}", size=18, weight="bold", color=ft.colors.CYAN_400),
                        ft.Container(height=5),
                        ft.Text("Avg Expl", size=12, color="grey"),
                        ft.Text(f"{data['avg_expl']:.1f}", size=18, weight="bold"),
                    ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    
                    ft.VerticalDivider(width=10, color="grey"),

                     # Time Column (Right)
                    ft.Column([
                        ft.Text("Best Time", size=12, color="grey"),
                        ft.Text(f"{data.get('best_time', 0):.1f}s", size=18, weight="bold", color=ft.colors.AMBER_400),
                        ft.Container(height=5),
                        ft.Text("Avg Time", size=12, color="grey"),
                        ft.Text(f"{data.get('avg_time', 0):.1f}s", size=18, weight="bold"),
                    ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ], alignment=ft.MainAxisAlignment.SPACE_EVENLY, expand=True),
                
                ft.Container(expand=True),
                ft.Text(f"{data['total']} Successful Runs", size=13, weight="bold", color=ft.colors.WHITE70)
            ], alignment=ft.MainAxisAlignment.SPACE_EVENLY, horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=2)

            container = ft.Container(
                content=card_content,
                bgcolor=ft.colors.GREY_900,
                border_radius=8,
                padding=10,
                ink=True,
                on_click=lambda e, n=t_name: self.show_detail(n)
            )
            cards.append(container)

        grid = ft.GridView(
            controls=cards,
            runs_count=5, 
            child_aspect_ratio=1.0, 
            spacing=10,
            run_spacing=10,
            expand=True
        )
        
        sort_dropdown = ft.Dropdown(
            width=140,
            text_size=12,
            value=self.grid_sort_option,
            options=[
                ft.dropdown.Option("Most Runs"),
                ft.dropdown.Option("Best Time"),
                ft.dropdown.Option("Best Avg Expl"),
                ft.dropdown.Option("Alphabetical"),
            ],
            on_change=self.on_grid_sort_change,
            content_padding=5,
            height=30
        )

        header_row = ft.Row([
            ft.Text("Tower Analytics", size=20, weight="bold"),
            ft.Container(expand=True),
            ft.Text("Sort:", size=12, color="grey"),
            sort_dropdown
        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN)
        
        self.main_container.content = ft.Column([
            header_row,
            ft.Divider(),
            grid
        ], expand=True)

    def on_grid_sort_change(self, e):
        self.grid_sort_option = e.control.value
        self.show_grid()

    def show_detail(self, tower_name, initial_filter_type=None):
        self.view_mode = "detail"
        self.current_tower = tower_name
        self.all_runs = database.get_runs_by_tower(tower_name)
        
        unique_types = sorted(list(set(r[6] for r in self.all_runs if r[6] and r[6] != "Unknown")))
        if initial_filter_type and initial_filter_type in unique_types:
            self.active_types = {initial_filter_type}
        else:
            self.active_types = set(unique_types)
        
        # --- UI CONTROLS ---
        tower_index = self.tower_names.index(tower_name) if tower_name in self.tower_names else -1
        
        nav_header = ft.Row([
            ft.IconButton(ft.icons.ARROW_BACK, tooltip="Back to Comparison", on_click=lambda e: self.show_grid()),
            ft.Container(width=10),
            ft.IconButton(
                ft.icons.CHEVRON_LEFT, 
                tooltip="Next Tower (Up)",
                disabled=(tower_index <= 0), 
                on_click=lambda e: self.show_detail(self.tower_names[tower_index - 1])
            ),
            ft.IconButton(
                ft.icons.CHEVRON_RIGHT, 
                tooltip="Prev Tower (Down)",
                disabled=(tower_index == -1 or tower_index >= len(self.tower_names) - 1), 
                on_click=lambda e: self.show_detail(self.tower_names[tower_index + 1])
            ),
            ft.Container(width=10),
            ft.Text(f"{tower_name}", size=24, weight="bold"),
        ], alignment=ft.MainAxisAlignment.START)

        self.filter_row = ft.Row(wrap=True, expand=True)
        self._build_filter_controls(unique_types)

        self.chart_toggle = ft.SegmentedButton(
            selected={self.chart_mode},
            show_selected_icon=False,
            segments=[
                ft.Segment(value="expl", label=ft.Text("Explosives")),
                ft.Segment(value="time", label=ft.Text("Time")),
            ],
            on_change=self.on_chart_mode_change
        )
        
        # NEW CONTROLS
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
            label="Group", 
            value=str(self.group_size), 
            width=60, 
            text_size=12,
            content_padding=5,
            keyboard_type=ft.KeyboardType.NUMBER,
            on_submit=self.on_group_submit,
            on_blur=self.on_group_submit
        )

        self.detail_sort_dropdown = ft.Dropdown(
            width=100,
            text_size=12,
            value=self.detail_sort_option,
            options=[
                ft.dropdown.Option("Newest"),
                ft.dropdown.Option("Oldest"),
                ft.dropdown.Option("Best Expl"),
                ft.dropdown.Option("Best Time"),
            ],
            on_change=self.on_detail_sort_change,
            content_padding=5
        )

        # Organization
        controls_row_1 = ft.Row([
            ft.Column([ft.Text("Filter Type:", size=12, color="grey"), self.filter_row], expand=True),
        ])
        
        controls_row_2 = ft.Row([
            self.chart_toggle,
            ft.Container(width=10),
            self.trend_button,
            self.group_input,
            ft.Container(expand=True),
            self.detail_sort_dropdown
        ], alignment=ft.MainAxisAlignment.START)

        self.chart_container = ft.Container(height=300, padding=10, bgcolor=ft.colors.BLACK54, border_radius=8)
        self.stats_container = ft.Row(alignment=ft.MainAxisAlignment.SPACE_AROUND)
        self.list_container = ft.Column(scroll=ft.ScrollMode.ADAPTIVE, expand=True)
        
        list_header = ft.Container(
            content=ft.Row([
                ft.Text("Expl", width=50, weight="bold", color="grey"),
                ft.Text("Time", width=100, weight="bold", color="grey"),
                ft.Text("Bed", width=60, weight="bold", color="grey"),
                ft.Text("Y", width=30, weight="bold", color="grey"),
                ft.Text("Type", expand=True, weight="bold", color="grey"),
                ft.Text("Date", width=120, weight="bold", color="grey"),
            ]),
            padding=ft.padding.only(left=5, bottom=5)
        )

        self.main_container.content = ft.Column([
            nav_header,
            controls_row_1,
            ft.Container(height=5),
            controls_row_2,
            self.chart_container,
            ft.Divider(height=10, color="transparent"),
            self.stats_container,
            ft.Divider(),
            ft.Text("Run History", weight="bold"),
            list_header,
            self.list_container
        ], expand=True)
        
        self._refresh_detail_content()
        self.update()

    # --- EVENT HANDLERS ---
    def _build_filter_controls(self, all_types):
        controls = []
        for t_type in all_types:
            is_active = t_type in self.active_types
            bg_color = ft.colors.BLUE_700 if is_active else ft.colors.TRANSPARENT
            border_color = ft.colors.BLUE_700 if is_active else ft.colors.GREY_700
            
            btn = ft.Container(
                content=ft.Text(t_type, size=12, color="white" if is_active else "grey"),
                padding=8,
                border_radius=15,
                bgcolor=bg_color,
                border=ft.border.all(1, border_color),
                ink=True,
                on_click=lambda e, t=t_type: self.toggle_filter(t)
            )
            controls.append(btn)
        self.filter_row.controls = controls

    def toggle_filter(self, t_type):
        if t_type in self.active_types:
            self.active_types.remove(t_type)
        else:
            self.active_types.add(t_type)
        current_buttons = self.filter_row.controls
        all_types_in_ui = [btn.content.value for btn in current_buttons]
        self._build_filter_controls(all_types_in_ui)
        self.filter_row.update()
        self._refresh_detail_content()
        self.update()

    def on_chart_mode_change(self, e):
        self.chart_mode = list(e.control.selected)[0]
        # Persist
        config.save_config(self.page, {"chart_mode": self.chart_mode})
        
        self._refresh_detail_content()
        self.update()

    def on_detail_sort_change(self, e):
        self.detail_sort_option = self.detail_sort_dropdown.value
        self._refresh_detail_content()
        self.update()

    def on_trend_click(self, e):
        self.show_trend = not self.show_trend
        self.trend_button.selected = self.show_trend
        
        # Persist
        config.save_config(self.page, {"show_trend": self.show_trend})
        
        self.trend_button.update()
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

    # --- REFRESH LOGIC ---
    def _refresh_detail_content(self):
        filtered_runs = [r for r in self.all_runs if r[6] in self.active_types]
        
        # Stats Calculation
        total = len(filtered_runs)
        successes = [r for r in filtered_runs if r[9]]
        success_count = len(successes)
        
        avg_expl_val = 0
        avg_time_val = 0
        best_expl_val = 0
        best_time_val = 0
        
        if success_count > 0:
            avg_expl_val = sum(r[4] for r in successes) / success_count
            best_expl_val = min(r[4] for r in successes)
            
            valid_time_runs = [r for r in successes if r[2] > 0]
            if valid_time_runs:
                avg_time_val = sum(r[2] for r in valid_time_runs) / len(valid_time_runs)
                best_time_val = min(r[2] for r in valid_time_runs)
            
        self.stats_container.controls = [
             ft.Column([
                ft.Text("Successful Runs", color="grey"), 
                ft.Text(f"{success_count}", size=20, weight="bold")
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            
            ft.VerticalDivider(width=20, color="grey"),
            
            ft.Row([
                ft.Column([
                    ft.Text("Best Expl", color="grey", size=12),
                    ft.Text(f"{best_expl_val}", size=16, weight="bold", color=ft.colors.CYAN_400),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Column([
                    ft.Text("Avg Expl", color="grey", size=12),
                    ft.Text(f"{avg_expl_val:.2f}", size=16, weight="bold"),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ], spacing=20),
            
            ft.VerticalDivider(width=20, color="grey"),

            ft.Row([
                 ft.Column([
                    ft.Text("Best Time", color="grey", size=12),
                    ft.Text(f"{best_time_val:.2f}s", size=16, weight="bold", color=ft.colors.AMBER_400),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Column([
                    ft.Text("Avg Time", color="grey", size=12),
                    ft.Text(f"{avg_time_val:.2f}s", size=16, weight="bold"),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ], spacing=20),
        ]

        # --- CHART LOGIC ---
        # Sort chronologically for chart
        chart_data_source = sorted(successes, key=lambda x: x[1])
        
        # Extract Y values (Explosives or Time)
        # FILTER: Ignore 0 explosives to avoid the bug/noise
        y_values = []
        if self.chart_mode == "expl":
            y_values = [r[4] for r in chart_data_source if r[4] > 0]
            y_title = "Explosives"
            chart_color = ft.colors.CYAN_400
        else:
            y_values = [r[2] for r in chart_data_source]
            y_title = "Time (s)"
            chart_color = ft.colors.PURPLE_400

        # Apply Grouping
        points = []
        final_y_values = [] # For Trend Line calculation
        
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

        # Calculate Trend Line (Linear Regression)
        if self.show_trend and len(final_y_values) > 1:
            # simple linear regression: y = mx + b
            # x values are the index (or grouped index)
            n = len(final_y_values)
            sum_x = sum(x for x, y in final_y_values)
            sum_y = sum(y for x, y in final_y_values)
            sum_xy = sum(x*y for x, y in final_y_values)
            sum_xx = sum(x*x for x, y in final_y_values)
            
            denominator = (n * sum_xx - sum_x * sum_x)
            if denominator != 0:
                m = (n * sum_xy - sum_x * sum_y) / denominator
                b = (sum_y - m * sum_x) / n
                
                # Create line from first X to last X
                start_x = final_y_values[0][0]
                end_x = final_y_values[-1][0]
                
                trend_points = [
                    ft.LineChartDataPoint(x=start_x, y=m*start_x + b),
                    ft.LineChartDataPoint(x=end_x, y=m*end_x + b)
                ]
                
                data_series.append(
                    ft.LineChartData(
                        data_points=trend_points,
                        stroke_width=2,
                        color=ft.colors.WHITE54,
                        dash_pattern=[5, 5],
                        curved=False
                    )
                )

        chart = ft.LineChart(
            data_series=data_series,
            border=ft.border.all(1, ft.colors.GREY_800),
            left_axis=ft.ChartAxis(labels_size=30, title=ft.Text(y_title, size=10)),
            bottom_axis=ft.ChartAxis(title=ft.Text(f"Runs (Grouped by {self.group_size})" if self.group_size > 1 else "Runs", size=10), labels_size=0),
            tooltip_bgcolor=ft.colors.GREY_800,
            expand=True
        )
        self.chart_container.content = chart

        # --- LIST LOGIC ---
        # Sort for List View
        sorted_runs = list(filtered_runs)
        if self.detail_sort_option == "Newest":
            sorted_runs.sort(key=lambda x: (x[1], x[0]), reverse=True)
        elif self.detail_sort_option == "Oldest":
            sorted_runs.sort(key=lambda x: (x[1], x[0]), reverse=False)
        elif self.detail_sort_option == "Best Expl":
            sorted_runs.sort(key=lambda x: x[4] if x[9] else 999, reverse=False)
        elif self.detail_sort_option == "Best Time":
            sorted_runs.sort(key=lambda x: x[2] if x[2] > 0 else 999, reverse=False)

        list_rows = []
        for run in sorted_runs:
            time_val = run[2]
            expl_str = run[3]
            r_type = run[6]
            bed = run[8]
            is_success = bool(run[9])
            fail_reason = run[10]
            date_str = run[1]
            
            height = run[7]
            
            # Hide Failure Logic
            if not is_success and self.hide_failures:
                continue

            if is_success:
                row_content = [
                    ft.Text(f"{expl_str}", width=50, weight="bold", color=ft.colors.CYAN_200, size=16),
                    ft.Text(f"{time_val:.2f}s", width=100, weight="bold"),
                    ft.Text(f"{bed:.2f}s" if bed else "-", width=60, color=ft.colors.ORANGE_300),
                    ft.Text(f"{height}" if height > 0 else "-", width=30, color="grey"),
                    ft.Text(f"{r_type}", expand=True, size=14),
                    ft.Text(date_str, width=120, size=12, color="grey")
                ]
                bg_col = ft.colors.TRANSPARENT
            else:
                row_content = [
                    ft.Text("-", width=50, weight="bold", color="grey"),
                    ft.Text(f"{time_val:.1f}s ({fail_reason})", width=100, color=ft.colors.RED_400, weight="bold"),
                    ft.Text("-", width=60, color="grey"),
                    ft.Text("-", width=30, color="grey"),
                    ft.Text(f"{r_type}", expand=True, size=14, italic=True, color="grey"),
                    ft.Text(date_str, width=120, size=12, color="grey")
                ]
                bg_col = ft.colors.with_opacity(0.05, ft.colors.RED)

            row = ft.Container(
                content=ft.Row(row_content, alignment=ft.MainAxisAlignment.START),
                padding=10,
                bgcolor=bg_col,
                border=ft.border.only(bottom=ft.border.BorderSide(1, "#333333"))
            )
            list_rows.append(row)
        
        self.list_container.controls = list_rows