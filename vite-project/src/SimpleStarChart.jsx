import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const SimpleStarChart = () => {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const nodesRef = useRef(null);

  const scrollProgressRef = useRef(0);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = docHeight > 0 ? scrollTop / docHeight : 0;
      setScrollProgress(scrolled);
      scrollProgressRef.current = scrolled;
    };

    handleScroll();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const width = dimensions.width;
    const height = dimensions.height;
    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);

    const h1Element = document.querySelector('h1');
    const titleHeight = h1Element ? h1Element.offsetHeight + 20 : 70;
    const titleBottom = titleHeight + 1;

    svg.attr('width', width).attr('height', height).selectAll('*').remove();

    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#050510');

    d3.csv('/pharma_ranking_2025_cleaned.csv').then((data) => {
      const formattedData = data.map((d) => ({
        ...d,
        sales: +d.sales_million_yen,
        rd: d.rd_million_yen ? +d.rd_million_yen : 0,
      }));

      const asterias = formattedData.find((d) => d.company === 'アステラス製薬');
      if (asterias) {
        asterias.fx = width / 2;
        asterias.fy = height / 2;
      }

      const maxSales = d3.max(formattedData, (d) => d.sales);
      const minSize = Math.min(width, height) * 0.01;
      const maxSize = Math.min(width, height) * 0.1;
      const sizeScale = d3.scaleSqrt()
        .domain([0, maxSales])
        .range([minSize, maxSize]);

      const dotCenterY = titleBottom + Math.min(width, height) * 0.4;
      const simulation = d3.forceSimulation(formattedData)
        .force('charge', d3.forceManyBody().strength(-5))
        .force('center', d3.forceCenter(width / 2, dotCenterY))
        .force('collide', d3.forceCollide().radius((d) => sizeScale(d.sales) + 2))
        .alphaDecay(0.05);

      // Text is now handled by React DOM overlay.

      const glowStrength = Math.min(width, height) * 0.0015;
      const defs = svg.append('defs');

      const glowFilter = defs.append('filter').attr('id', 'glow');
      glowFilter.append('feGaussianBlur').attr('stdDeviation', glowStrength).attr('result', 'coloredBlur');
      const feMerge = glowFilter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      const redGlowFilter = defs.append('filter').attr('id', 'redGlow');
      redGlowFilter.append('feGaussianBlur').attr('stdDeviation', glowStrength * 2).attr('result', 'coloredBlur');
      redGlowFilter.append('feFlood').attr('flood-color', '#ff6666').attr('result', 'redColor');
      redGlowFilter.append('feComposite').attr('in', 'redColor').attr('in2', 'coloredBlur').attr('operator', 'in').attr('result', 'redBlur');
      const redMerge = redGlowFilter.append('feMerge');
      redMerge.append('feMergeNode').attr('in', 'redBlur');
      redMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      const initialIsPastHalf = scrollProgressRef.current >= 0.5;

      const nodes = svg.append('g')
        .selectAll('circle')
        .data(formattedData)
        .enter()
        .append('circle')
        .attr('class', (d) => d.company === 'アステラス製薬' ? 'astellas-dot' : 'other-dot')
        .attr('r', (d) => {
          d.baseR = sizeScale(d.sales);
          const initialIsPastThreeQuarters = scrollProgressRef.current >= 0.75;
          if (d.company === 'アステラス製薬') {
            return initialIsPastThreeQuarters ? d.baseR * 3 : d.baseR;
          } else {
            return initialIsPastThreeQuarters ? 0 : d.baseR;
          }
        })
        .attr('fill', (d) => (d.company === 'アステラス製薬' && initialIsPastHalf) ? '#ff6666' : '#ffffff')
        .attr('stroke', 'none')
        .attr('opacity', (d) => {
          const initialIsPastThreeQuarters = scrollProgressRef.current >= 0.75;
          return (d.company !== 'アステラス製薬' && initialIsPastThreeQuarters) ? 0 : 1.0;
        })
        .attr('filter', (d) => (d.company === 'アステラス製薬' && initialIsPastHalf) ? 'url(#redGlow)' : 'url(#glow)')
        .style('cursor', 'pointer')
        .style('pointer-events', (d) => {
          const initialIsPastThreeQuarters = scrollProgressRef.current >= 0.75;
          return initialIsPastThreeQuarters ? 'none' : 'auto';
        })
        .on('mouseover', (event, d) => {
          const isPastThreeQuarters = scrollProgressRef.current >= 0.75;
          if (isPastThreeQuarters) return;
          d3.select(event.currentTarget).attr('fill', '#cce6ff').attr('opacity', 1);
          tooltip.style('opacity', 1)
            .html(`<strong>${d.company}</strong><br/><span style="font-size: 12px; color: #ccc;">売上高: ${Math.round(d.sales / 100).toLocaleString()} 億円</span>`);
        })
        .on('mousemove', (event) => {
          tooltip.style('left', `${event.clientX + 15}px`).style('top', `${event.clientY - 25}px`);
        })
        .on('mouseout', (event, d) => {
          const isTargetRed = d.company === 'アステラス製薬' && scrollProgressRef.current >= 0.5;
          const isPastThreeQuarters = scrollProgressRef.current >= 0.75;
          const targetOpacity = (d.company !== 'アステラス製薬' && isPastThreeQuarters) ? 0 : 1.0;
          d3.select(event.currentTarget)
            .attr('fill', isTargetRed ? '#ff6666' : '#ffffff')
            .attr('opacity', targetOpacity);
          tooltip.style('opacity', 0);
        });

      nodesRef.current = nodes;

      const yMin = titleBottom + 5;
      const yMax = height - 20;
      simulation.on('tick', () => {
        nodes
          .attr('cx', (d) => (d.x = Math.max(sizeScale(d.sales), Math.min(width - sizeScale(d.sales), d.x))))
          .attr('cy', (d) => (d.y = Math.max(yMin + sizeScale(d.sales), Math.min(yMax - sizeScale(d.sales), d.y))));
      });
    }).catch((error) => {
      console.error('CSV Load Error:', error);
    });

    return () => {
      svg.selectAll('*').remove();
    };
  }, [dimensions]);

  useEffect(() => {
    if (!svgRef.current) return;

    const isPastHalf = scrollProgress >= 0.5;
    const isPastThreeQuarters = scrollProgress >= 0.75;
    const svg = d3.select(svgRef.current);

    svg.selectAll('.other-dot')
      .transition().duration(400)
      .attr('opacity', isPastThreeQuarters ? 0 : 1.0)
      .attr('r', (d) => isPastThreeQuarters ? 0 : d.baseR)
      .style('pointer-events', isPastThreeQuarters ? 'none' : 'auto');

    svg.selectAll('.astellas-dot')
      .transition().duration(400)
      .attr('filter', isPastHalf ? 'url(#redGlow)' : 'url(#glow)')
      .attr('fill', isPastHalf ? '#ff6666' : '#ffffff')
      .attr('r', (d) => isPastThreeQuarters ? d.baseR * 3 : d.baseR);

  }, [scrollProgress]);

  return (
    <div style={{ position: 'relative', width: '100vw', minHeight: '400vh' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <h1 style={{
          position: 'fixed',
          top: '20px',
          left: 0, // ★修正: 40pxから0に変更
          right: 0, // ★修正: rightも0にすることで画面幅全体を指定
          margin: 0,
          padding: '0 20px', // ★修正: 左右に最低限の余白を確保
          color: '#fff',
          textAlign: 'center', // ★修正: 中央揃えに変更
          zIndex: 100,
          fontSize: 'clamp(28px, 6vw, 64px)',
          fontFamily: "'Georgia', serif",
          fontWeight: '300',
          letterSpacing: '2px'
        }}>
          A Star in a Pharma Nebula
        </h1>
        <svg ref={svgRef} style={{ display: 'block', pointerEvents: 'auto' }}></svg>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '18%',
          left: '50%',
          transform: `translate(-50%, ${scrollProgress >= 0.5 && scrollProgress < 0.75 ? '0' : '150%'})`,
          opacity: scrollProgress >= 0.5 && scrollProgress < 0.75 ? 0.95 : 0,
          background: 'rgba(50, 55, 65, 0.85)',
          padding: '20px 40px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          fontSize: 'clamp(14px, 2.5vw, 24px)',
          fontFamily: "'Georgia', serif",
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
          pointerEvents: 'none',
          zIndex: 50,
          width: 'max-content',
          maxWidth: '90vw',
          lineHeight: '1.6',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          Dots represent the FY2025 sales of Japan-based pharmaceutical companies.
        </div>
        <div>
          <span style={{ color: '#ff6666', fontWeight: 'bold' }}>Astellas</span> is a relatively large pharmaceutical company in terms of revenue.
        </div>
      </div>

      <div
        ref={tooltipRef}
        style={{
          position: 'fixed', opacity: 0, background: 'rgba(10, 15, 30, 0.9)',
          padding: '10px 15px', border: '1px solid #445588', borderRadius: '6px',
          pointerEvents: 'none', color: '#fff', fontSize: '14px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'opacity 0.2s ease', zIndex: 10,
        }}
      ></div>
    </div>
  );
};

export default SimpleStarChart;