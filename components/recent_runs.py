import flet as ft
import database
import config
from datetime import datetime

def get_view(page, on_run_click=None):
    # Load persisted state
    cfg = config.load_config(page)
    init_chart_mode = cfg.get("chart_mode", "expl")
    init_hide_fails = cfg.get("hide_fails", False)

    # --- UI Elements ---
    chart_container = ft.Container(height=150, bgcolor=ft.colors.BLACK54, border_radius=8, padding=10)
    
    table = ft.DataTable(
        columns=[
            ft.DataColumn(ft.Text("Expl")),
            ft.DataColumn(ft.Text("Time")),
            ft.DataColumn(ft.Text("Bed")),
            ft.DataColumn(ft.Text("Tower")),
            ft.DataColumn(ft.Text("Type")),
            ft.DataColumn(ft.Text("Y")), # Height
            ft.DataColumn(ft.Text("Date")),
        ],
        rows=[],
        column_spacing=10,
        data_row_min_height=35,
        heading_row_height=30,
        show_checkbox_column=False,
    )

    # Scrollable area — ONLY the table goes here
    table_scroll = ft.ListView(expand=True, spacing=0)
    table_scroll.controls = [
        ft.Container(content=table, padding=ft.padding.only(top=5))
    ]

    # --- Controls ---
    def on_chart_change(e):
        new_mode = list(e.control.selected)[0]
        config.save_config(page, {"chart_mode": new_mode})
        update_table(outer_column)

    chart_mode_segment = ft.SegmentedButton(
        selected={init_chart_mode},
        show_selected_icon=False,
        segments=[
            ft.Segment(value="expl", label=ft.Text("Explosives")),
            ft.Segment(value="time", label=ft.Text("Time")),
        ],
        on_change=on_chart_change
    )

    group_input = ft.TextField(
        label="Group", value="1", width=80, text_size=12,
        keyboard_type=ft.KeyboardType.NUMBER,
        on_submit=lambda e: update_table(outer_column)
    )

    def on_trend_click(e):
        trend_button.selected = not trend_button.selected
        config.save_config(page, {"show_trend": trend_button.selected})
        trend_button.update()
        update_table(outer_column)

    trend_button = ft.IconButton(
        icon=ft.icons.TIMELINE,
        icon_color="white",
        selected_icon=ft.icons.TIMELINE,
        selected_icon_color="cyan",
        selected=cfg.get("show_trend", False),
        tooltip="Toggle Trend Line",
        on_click=on_trend_click
    )

    def on_fail_click(e):
        fail_button.selected = not fail_button.selected
        config.save_config(page, {"hide_fails": fail_button.selected})
        fail_button.update()
        update_table(outer_column)

    fail_button = ft.IconButton(
        icon=ft.icons.FILTER_ALT_OFF,
        icon_color="white",
        selected_icon=ft.icons.FILTER_ALT,
        selected_icon_color="red",
        selected=init_hide_fails,
        tooltip="Hide Fails",
        on_click=on_fail_click
    )

    # Fixed header (not scrollable)
    header_row = ft.Row([
        ft.Text("Recent History", size=20, weight="bold"),
        ft.Container(expand=True),
        trend_button,
        fail_button,
        group_input,
        chart_mode_segment,
    ], alignment=ft.MainAxisAlignment.START, spacing=15)

    # Outer layout: fixed header + chart on top, scrollable table below
    outer_column = ft.Column([
        header_row,
        chart_container,
        table_scroll,
    ], expand=True, spacing=10)

    # Store references on outer_column for update_table / set_width
    outer_column.table_ref = table
    outer_column.chart_ref = chart_container
    outer_column.chart_mode_ref = chart_mode_segment
    outer_column.group_ref = group_input
    outer_column.trend_ref = trend_button
    outer_column.fail_ref = fail_button
    outer_column.on_run_click_callback = on_run_click
    
    return outer_column, outer_column

def toggle_icon_button(e, main_control):
    e.control.selected = not e.control.selected
    e.control.update()
    update_table(main_control)

def set_width(main_control, width):
    main_control.current_width = width
    update_table(main_control)

def update_table(main_control):
    table = main_control.table_ref
    chart_container = main_control.chart_ref
    chart_mode = list(main_control.chart_mode_ref.selected)[0]
    hide_fails = main_control.fail_ref.selected
    show_trend = main_control.trend_ref.selected
    
    # Calculate Scale
    current_w = getattr(main_control, 'current_width', 450)
    # Less aggressive scaling: maxing out around 1.4x at 800px width
    # 450px -> 1.0
    # 800px -> 1.0 + (350 * 0.0011) ≈ 1.385
    ratio = (current_w - 450.0) * 0.0011
    scale = 1.0 + ratio
    
    if scale < 1.0: scale = 1.0
    if scale > 1.4: scale = 1.4
    
    # Font Sizes
    s_expl = 13 * scale
    s_time = 13 * scale
    s_bed = 12 * scale
    s_other = 11 * scale
    s_date = 10 * scale
    
    try:
        group_size = int(main_control.group_ref.value)
        if group_size < 1: group_size = 1
    except:
        group_size = 1

    all_runs = database.get_recent_runs(limit=100) # Get more to allow for filtering
    
    # --- TABLE LOGIC ---
    new_rows = []
    pb_map = database.get_pbs_map()
    
    # We display the last 50 *visible* runs
    visible_count = 0
    for run in all_runs:
        if visible_count >= 50: break
        
        is_success = bool(run[9])
        if hide_fails and not is_success:
            continue
            
        visible_count += 1
        ts_str = run[1]
        time_val = run[2]
        expl_str = run[3]
        total_expl = run[4]
        tower = run[5]
        r_type = run[6]
        height = run[7]
        bed = run[8]

        try:
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            date_display = dt.strftime("%m/%d %H:%M")
        except:
            date_display = ts_str

        row_color = "white"
        if not is_success:
            row_color = ft.colors.RED_400
            # Show fail reason in Expl column
            fail_reason = run[10] if run[10] else "Fail"
            expl_display = fail_reason
            bed_display = "-"
            time_display = f"{time_val:.1f}s"
            tower_display = tower if tower != "Unknown" else "-"
            type_display = r_type if r_type != "Unknown" else "-"
            height_display = "-"
        else:
            expl_display = expl_str
            time_display = f"{time_val:.2f}s"
            bed_display = f"{bed:.2f}s" if bed else "-"
            tower_display = tower
            type_display = r_type
            height_display = str(height) if height > 0 else "-"
            
            key = (tower, r_type)
            if key in pb_map and total_expl == pb_map[key]:
                row_color = ft.colors.YELLOW_400

        def on_row_click(e, t=tower, rt=r_type):
            if hasattr(main_control, 'on_run_click_callback') and main_control.on_run_click_callback:
                if t != "Unknown":
                    main_control.on_run_click_callback(t, rt)

        new_rows.append(
            ft.DataRow(
                on_select_changed=on_row_click,
                cells=[
                    ft.DataCell(ft.Text(expl_display, color=row_color, weight="bold", size=s_expl, no_wrap=True, overflow=ft.TextOverflow.ELLIPSIS)),
                    ft.DataCell(ft.Text(time_display, color=row_color, size=s_time, no_wrap=True)),
                    ft.DataCell(ft.Text(bed_display, size=s_bed, color=ft.colors.ORANGE_300 if bed else "grey", no_wrap=True)),
                    ft.DataCell(ft.Text(tower_display, size=s_other, no_wrap=True, overflow=ft.TextOverflow.ELLIPSIS)),
                    ft.DataCell(ft.Text(type_display, size=s_other, no_wrap=True, overflow=ft.TextOverflow.ELLIPSIS)),
                    ft.DataCell(ft.Text(height_display, size=s_other, no_wrap=True)),
                    ft.DataCell(ft.Text(date_display, size=s_date, color="grey", no_wrap=True)),
                ]
            )
        )
    table.rows = new_rows
    table.update()

    # --- CHART LOGIC ---
    # Process successes for the graph
    chart_data_source = [r for r in reversed(all_runs) if r[9]]
    
    y_values = []
    if chart_mode == "expl":
        y_values = [r[4] for r in chart_data_source if r[4] > 0]
        chart_color = ft.colors.CYAN_400
        title_text = "Expl."
    else:
        y_values = [r[2] for r in chart_data_source]
        chart_color = ft.colors.PURPLE_400
        title_text = "Time"

    points = []
    final_coords = []
    if group_size > 1:
        for i in range(0, len(y_values), group_size):
            chunk = y_values[i : i + group_size]
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

    # Trend Line
    if show_trend and len(final_coords) > 1:
        n = len(final_coords)
        sum_x = sum(x for x, y in final_coords); sum_y = sum(y for x, y in final_coords); sum_xy = sum(x*y for x, y in final_coords); sum_xx = sum(x*x for x, y in final_coords)
        denom = (n * sum_xx - sum_x * sum_x)
        if denom != 0:
            m = (n * sum_xy - sum_x * sum_y) / denom; b = (sum_y - m * sum_x) / n
            start_x, end_x = final_coords[0][0], final_coords[-1][0]
            data_series.append(ft.LineChartData(
                data_points=[ft.LineChartDataPoint(x=start_x, y=m*start_x+b), ft.LineChartDataPoint(x=end_x, y=m*end_x+b)],
                stroke_width=1, color=ft.colors.WHITE54, dash_pattern=[5, 5]
            ))

    chart = ft.LineChart(
        data_series=data_series,
        border=ft.border.all(1, ft.colors.GREY_800),
        left_axis=ft.ChartAxis(
            labels_size=40, 
            title=ft.Text(title_text, size=10),
            show_labels=True
        ),
        bottom_axis=ft.ChartAxis(labels_size=0),
        tooltip_bgcolor=ft.colors.GREY_800,
        expand=True
    )
    chart_container.content = chart
    chart_container.update()